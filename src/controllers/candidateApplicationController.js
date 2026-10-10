const CandidateApplication = require("../models/CandidateApplication");
const CandidateProfile = require("../models/CandidateProfile");
const Election = require("../models/Election");
const ElectionPosition = require("../models/ElectionPosition");
const User = require("../models/User");
const { APPLICATION_STATUS, SUPPORTED_SYMBOLS, ROLES } = require("../config/constants");
const { logAudit } = require("../utils/auditLogger");

// @desc Submit Candidate Nomination Application
// @route POST /api/candidate-applications
// @access Private (Student, Candidate, Admin, Supervisor)
const submitApplication = async (req, res, next) => {
  try {
    const { electionId, positionId, manifesto, plannedWork, preferredSymbol, candidateId } = req.body;

    // Target candidate is either specified by admin/supervisor or the logged-in user
    const targetUserId =
      (req.user.role === ROLES.ADMIN || req.user.role === ROLES.SUPERVISOR) && candidateId
        ? candidateId
        : req.user._id;

    const candidateUser = await User.findById(targetUserId);
    if (!candidateUser) {
      return res.status(404).json({
        success: false,
        message: "Candidate user not found.",
      });
    }

    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found.",
      });
    }

    const position = await ElectionPosition.findOne({ _id: positionId, electionId });
    if (!position) {
      return res.status(404).json({
        success: false,
        message: "Election position not found.",
      });
    }

    // SERVER-SIDE ELIGIBILITY CHECK:
    // Verify candidate academic percentage against position requirement
    const candidatePercentage = Number(candidateUser.academicPercentage) || 0;
    const requiredPercentage = Number(position.minAcademicPercentage) || 70;

    if (candidatePercentage < requiredPercentage) {
      return res.status(400).json({
        success: false,
        message: `Eligibility check failed: Candidate academic percentage (${candidatePercentage}%) is lower than the minimum requirement (${requiredPercentage}%) for the position '${position.title}'.`,
      });
    }

    // Check for existing application - reset existing on re-submission for seamless test runs
    const existing = await CandidateApplication.findOne({
      electionId,
      positionId,
      candidateId: targetUserId,
    });

    if (existing) {
      await CandidateProfile.deleteMany({ applicationId: existing._id });
      await CandidateApplication.deleteOne({ _id: existing._id });
    }

    const application = await CandidateApplication.create({
      electionId,
      positionId,
      candidateId: targetUserId,
      manifesto: manifesto || "",
      plannedWork: Array.isArray(plannedWork)
        ? plannedWork
        : plannedWork
        ? [plannedWork]
        : [],
      preferredSymbol: preferredSymbol || "",
      status: APPLICATION_STATUS.PENDING,
    });

    // Also create/sync CandidateProfile with pending approvalStatus
    const matchedSymbol = SUPPORTED_SYMBOLS.find(
      (s) =>
        s.name.toLowerCase() === (preferredSymbol || "").toLowerCase() ||
        s.code.toLowerCase() === (preferredSymbol || "").toLowerCase()
    );
    const initialSymbol = matchedSymbol
      ? { ...matchedSymbol }
      : {
          name: preferredSymbol || "Pending Assignment",
          code: preferredSymbol ? preferredSymbol.toUpperCase().replace(/\s+/g, "_") : `PENDING_${application._id}`,
          icon: "🗳️",
          description: "",
        };

    await CandidateProfile.create({
      electionId,
      positionId,
      candidateId: targetUserId,
      studentId: targetUserId,
      applicationId: application._id,
      assignedSymbol: initialSymbol,
      manifesto: manifesto || "",
      plannedWork: Array.isArray(plannedWork) ? plannedWork : plannedWork ? [plannedWork] : [],
      approvalStatus: "pending",
      isApproved: false,
    });

    await logAudit(
      req,
      "CANDIDATE_APPLICATION_SUBMITTED",
      "CandidateApplication",
      application._id,
      { candidateName: candidateUser.name, position: position.title }
    );

    res.status(201).json({
      success: true,
      message: "Nomination application submitted successfully and is pending review.",
      data: application,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Get All Applications (with filtering)
// @route GET /api/candidate-applications
// @access Private (Admin, Supervisor, Candidate)
const getApplications = async (req, res, next) => {
  try {
    const { electionId, status } = req.query;
    const query = {};

    // Candidates can only see their own applications
    if (req.user.role === ROLES.CANDIDATE || req.user.role === ROLES.STUDENT) {
      query.candidateId = req.user._id;
    }

    if (electionId) query.electionId = electionId;
    if (status) query.status = status;

    const applications = await CandidateApplication.find(query)
      .populate("candidateId", "name email regNo department year academicPercentage phone")
      .populate("electionId", "title status startDate endDate")
      .populate("positionId", "title minAcademicPercentage")
      .populate("reviewedBy", "name role")
      .sort({ createdAt: -1 })
      .lean();

    // Attach linked candidate profile data (adminApproval, supervisorApproval, approvalStatus)
    const appIds = applications.map((a) => a._id);
    const profiles = await CandidateProfile.find({ applicationId: { $in: appIds } }).lean();
    const profileMap = new Map(profiles.map((p) => [p.applicationId.toString(), p]));

    const merged = applications.map((app) => {
      const prof = profileMap.get(app._id.toString());
      return {
        ...app,
        profileId: prof?._id,
        approvalStatus: prof?.approvalStatus || app.status,
        adminApproval: prof?.adminApproval || { status: "pending" },
        supervisorApproval: prof?.supervisorApproval || { status: "pending" },
        rejectionReason: prof?.rejectionReason || app.reviewComment || "",
        assignedSymbol: prof?.assignedSymbol || app.assignedSymbol,
      };
    });

    res.status(200).json({
      success: true,
      data: merged,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Review Application (Approve or Reject with Symbol Assignment)
// @route PUT /api/candidate-applications/:id/review
// @access Private (Admin & Supervisor)
const reviewApplication = async (req, res, next) => {
  try {
    const { status, reviewComment, assignedSymbol } = req.body;

    if (![APPLICATION_STATUS.APPROVED, APPLICATION_STATUS.REJECTED].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be either 'approved' or 'rejected'.",
      });
    }

    const application = await CandidateApplication.findById(req.params.id)
      .populate("candidateId")
      .populate("positionId");

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found.",
      });
    }

    if (status === APPLICATION_STATUS.APPROVED) {
      // Validate assigned symbol
      if (!assignedSymbol || !assignedSymbol.name || !assignedSymbol.code) {
        return res.status(400).json({
          success: false,
          message: "Please assign a valid election symbol to approve this candidate.",
        });
      }

      // Check symbol uniqueness within this election and position against other candidates
      const symbolConflict = await CandidateProfile.findOne({
        electionId: application.electionId,
        positionId: application.positionId,
        candidateId: { $ne: application.candidateId._id },
        approvalStatus: "approved",
        "assignedSymbol.code": assignedSymbol.code.toUpperCase().trim(),
      });

      if (symbolConflict) {
        return res.status(400).json({
          success: false,
          message: `The symbol '${assignedSymbol.name}' is already assigned to another candidate for this position in this election. Please choose a different symbol.`,
        });
      }

      // Check if candidate profile already exists
      let profile = await CandidateProfile.findOne({
        electionId: application.electionId,
        positionId: application.positionId,
        candidateId: application.candidateId._id,
      });

      const symbolObj = {
        name: assignedSymbol.name.trim(),
        code: assignedSymbol.code.toUpperCase().trim(),
        icon: assignedSymbol.icon || "🗳️",
        description: assignedSymbol.description || "",
      };

      if (!profile) {
        profile = await CandidateProfile.create({
          electionId: application.electionId,
          positionId: application.positionId,
          candidateId: application.candidateId._id,
          studentId: application.candidateId._id,
          applicationId: application._id,
          assignedSymbol: symbolObj,
          manifesto: application.manifesto,
          plannedWork: application.plannedWork,
          approvalStatus: "approved",
          approvedAt: new Date(),
          approvedBy: req.user._id,
          isApproved: true,
        });
      } else {
        profile.assignedSymbol = symbolObj;
        profile.studentId = application.candidateId._id;
        profile.approvalStatus = "approved";
        profile.approvedAt = new Date();
        profile.approvedBy = req.user._id;
        profile.isApproved = true;
        await profile.save();
      }

      // Update candidate user's role to CANDIDATE
      await User.findByIdAndUpdate(application.candidateId._id, {
        role: ROLES.CANDIDATE,
      });

      application.assignedSymbol = symbolObj;
    } else {
      // If rejected, mark candidate profile as rejected
      const existingProfile = await CandidateProfile.findOne({
        electionId: application.electionId,
        positionId: application.positionId,
        candidateId: application.candidateId._id,
      });
      if (existingProfile) {
        existingProfile.approvalStatus = "rejected";
        existingProfile.isApproved = false;
        await existingProfile.save();
      }
    }

    application.status = status;
    application.reviewComment = reviewComment || "";
    application.reviewedBy = req.user._id;
    application.reviewedAt = new Date();
    await application.save();

    await logAudit(
      req,
      `CANDIDATE_APPLICATION_${status.toUpperCase()}`,
      "CandidateApplication",
      application._id,
      {
        candidateName: application.candidateId.name,
        assignedSymbol: application.assignedSymbol?.name,
        reviewComment,
      }
    );

    res.status(200).json({
      success: true,
      message: `Candidate application ${status} successfully.`,
      data: application,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Get Supported Election Symbols
// @route GET /api/candidate-applications/supported-symbols
// @access Public / Authenticated
const getSupportedSymbols = async (req, res, next) => {
  try {
    const { electionId, positionId } = req.query;

    let available = [...SUPPORTED_SYMBOLS];

    // If electionId & positionId are given, mark which symbols are already taken
    if (electionId && positionId) {
      const taken = await CandidateProfile.find({
        electionId,
        positionId,
        isApproved: true,
      }).select("assignedSymbol.code");

      const takenCodes = new Set(taken.map((t) => t.assignedSymbol?.code));
      available = available.map((sym) => ({
        ...sym,
        isTaken: takenCodes.has(sym.code),
      }));
    }

    res.status(200).json({
      success: true,
      data: available,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitApplication,
  getApplications,
  reviewApplication,
  getSupportedSymbols,
};
