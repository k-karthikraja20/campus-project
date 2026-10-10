const mongoose = require("mongoose");
const CandidateProfile = require("../models/CandidateProfile");
const CandidateApplication = require("../models/CandidateApplication");
const User = require("../models/User");
const Election = require("../models/Election");
const ElectionPosition = require("../models/ElectionPosition");
const { ROLES, APPLICATION_STATUS, SUPPORTED_SYMBOLS } = require("../config/constants");
const { logAudit } = require("../utils/auditLogger");

// @desc Get Approved Candidates for Student Directory & Voting
// @route GET /api/candidates
// @access Public / Authenticated
const getCandidates = async (req, res, next) => {
  try {
    const { electionId, positionId } = req.query;

    // Strict approval enforcement: only return candidates with approvalStatus === "approved"
    // or legacy isApproved: true where approvalStatus is not explicitly rejected
    const query = {
      $or: [
        { approvalStatus: "approved" },
        { approvalStatus: { $exists: false }, isApproved: true },
      ],
    };

    if (electionId) query.electionId = electionId;
    if (positionId) query.positionId = positionId;

    const rawCandidates = await CandidateProfile.find(query)
      .populate("candidateId", "name regNo department year academicPercentage")
      .populate("studentId", "name regNo department year academicPercentage")
      .populate("positionId", "title minAcademicPercentage description")
      .populate("electionId", "title status startDate endDate")
      .sort({ createdAt: -1 })
      .lean();

    // Map each candidate so that candidate.studentId is guaranteed to contain
    // the populated student object expected by CandidateList.jsx (student.name, student.regNo, etc.)
    const candidates = rawCandidates.map((cand) => {
      const student = cand.studentId || cand.candidateId || {};
      return {
        ...cand,
        studentId: student,
        candidateId: cand.candidateId || student,
        approvalStatus: "approved",
      };
    });

    res.status(200).json({
      success: true,
      count: candidates.length,
      data: candidates,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Get Pending Candidates for Admin Review
// @route GET /api/candidates/pending
// @access Private (Admin & Supervisor)
const getPendingCandidates = async (req, res, next) => {
  try {
    const { electionId } = req.query;
    const query = {
      $or: [
        { approvalStatus: "pending" },
        { approvalStatus: { $exists: false }, isApproved: false },
      ],
    };

    if (electionId) query.electionId = electionId;

    const rawCandidates = await CandidateProfile.find(query)
      .populate("candidateId", "name email regNo department year academicPercentage phone")
      .populate("studentId", "name email regNo department year academicPercentage phone")
      .populate("positionId", "title minAcademicPercentage description")
      .populate("electionId", "title status startDate endDate")
      .sort({ createdAt: -1 })
      .lean();

    const candidates = rawCandidates.map((cand) => {
      const student = cand.studentId || cand.candidateId || {};
      return {
        ...cand,
        studentId: student,
        candidateId: cand.candidateId || student,
        approvalStatus: "pending",
      };
    });

    res.status(200).json({
      success: true,
      count: candidates.length,
      data: candidates,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Admin Approve Candidate
// @route PUT /api/candidates/:id/approve
// @access Private (Admin & Supervisor)
const approveCandidate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { assignedSymbol, reviewComment } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid candidate ID.",
      });
    }

    let candidate = await CandidateProfile.findById(id);
    if (!candidate) {
      candidate = await CandidateProfile.findOne({ applicationId: id });
    }

    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: "Candidate not found.",
      });
    }

    if (candidate.approvalStatus === "approved" || candidate.isApproved) {
      return res.status(400).json({
        success: false,
        message: "Candidate is already approved.",
      });
    }

    // Check symbol uniqueness if assignedSymbol is provided
    if (assignedSymbol && assignedSymbol.code) {
      const codeUpper = assignedSymbol.code.toUpperCase().trim();
      const symbolConflict = await CandidateProfile.findOne({
        _id: { $ne: candidate._id },
        electionId: candidate.electionId,
        positionId: candidate.positionId,
        approvalStatus: "approved",
        "assignedSymbol.code": codeUpper,
      });

      if (symbolConflict) {
        return res.status(400).json({
          success: false,
          message: `The symbol '${assignedSymbol.name || codeUpper}' is already assigned to another candidate for this position in this election.`,
        });
      }

      candidate.assignedSymbol = {
        name: assignedSymbol.name ? assignedSymbol.name.trim() : candidate.assignedSymbol?.name || "Official Symbol",
        code: codeUpper,
        icon: assignedSymbol.icon || candidate.assignedSymbol?.icon || "🗳️",
        description: assignedSymbol.description || candidate.assignedSymbol?.description || "",
      };
    }

    candidate.approvalStatus = "approved";
    candidate.isApproved = true;
    candidate.approvedAt = new Date();
    candidate.approvedBy = req.user ? req.user._id : null;
    await candidate.save();

    // Ensure user role is updated to candidate
    const candidateUserId = candidate.candidateId || candidate.studentId;
    if (candidateUserId) {
      await User.findByIdAndUpdate(candidateUserId, { role: ROLES.CANDIDATE });
    }

    // Sync linked application if present
    if (candidate.applicationId) {
      await CandidateApplication.findByIdAndUpdate(candidate.applicationId, {
        status: APPLICATION_STATUS.APPROVED,
        reviewedBy: req.user ? req.user._id : null,
        reviewedAt: new Date(),
        reviewComment: reviewComment || "Approved by administration.",
        ...(candidate.assignedSymbol ? { assignedSymbol: candidate.assignedSymbol } : {}),
      });
    }

    await logAudit(req, "CANDIDATE_APPROVED", "CandidateProfile", candidate._id, {
      candidateId: candidate.candidateId,
      positionId: candidate.positionId,
      assignedSymbol: candidate.assignedSymbol?.name,
    });

    // Populate for response
    const populated = await CandidateProfile.findById(candidate._id)
      .populate("candidateId", "name email regNo department year academicPercentage phone")
      .populate("studentId", "name email regNo department year academicPercentage phone")
      .populate("positionId", "title minAcademicPercentage")
      .populate("electionId", "title status")
      .lean();

    if (populated) {
      populated.studentId = populated.studentId || populated.candidateId;
    }

    return res.status(200).json({
      success: true,
      message: "Candidate approved successfully",
      data: populated || candidate,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Admin Reject Candidate (Unified legacy)
// @route PUT /api/candidates/:id/reject
// @access Private (Admin & Supervisor)
const rejectCandidate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reviewComment, rejectionReason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid candidate ID.",
      });
    }

    let candidate = await CandidateProfile.findById(id);
    if (!candidate) {
      candidate = await CandidateProfile.findOne({ applicationId: id });
    }

    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: "Candidate not found.",
      });
    }

    const reason = rejectionReason || reviewComment || "Rejected by administration.";
    candidate.approvalStatus = "rejected";
    candidate.isApproved = false;
    candidate.rejectionReason = reason;
    candidate.rejectedBy = req.user ? req.user._id : null;
    candidate.rejectedAt = new Date();
    if (req.user?.role === ROLES.SUPERVISOR) {
      candidate.supervisorApproval = { status: "rejected", approvedBy: req.user._id, approvedAt: new Date() };
    } else {
      candidate.adminApproval = { status: "rejected", approvedBy: req.user?._id || null, approvedAt: new Date() };
    }
    await candidate.save();

    // Sync linked application if present
    if (candidate.applicationId) {
      await CandidateApplication.findByIdAndUpdate(candidate.applicationId, {
        status: APPLICATION_STATUS.REJECTED,
        reviewedBy: req.user ? req.user._id : null,
        reviewedAt: new Date(),
        reviewComment: reason,
      });
    }

    await logAudit(req, "CANDIDATE_REJECTED", "CandidateProfile", candidate._id, {
      candidateId: candidate.candidateId,
      positionId: candidate.positionId,
    });

    return res.status(200).json({
      success: true,
      message: "Candidate rejected successfully",
      data: candidate,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Admin Approve Candidate (Two-Level Workflow)
// @route PUT /api/candidates/:id/admin-approve
// @access Private (Admin)
const adminApproveCandidate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { assignedSymbol, reviewComment } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid candidate ID.",
      });
    }

    let candidate = await CandidateProfile.findById(id);
    if (!candidate) {
      candidate = await CandidateProfile.findOne({ applicationId: id });
    }

    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: "Candidate not found.",
      });
    }

    if (candidate.adminApproval?.status === "approved") {
      return res.status(400).json({
        success: false,
        message: "Candidate has already been approved by Admin.",
      });
    }

    // Check symbol uniqueness if assignedSymbol is provided
    if (assignedSymbol && assignedSymbol.code) {
      const codeUpper = assignedSymbol.code.toUpperCase().trim();
      const symbolConflict = await CandidateProfile.findOne({
        _id: { $ne: candidate._id },
        electionId: candidate.electionId,
        positionId: candidate.positionId,
        approvalStatus: "approved",
        "assignedSymbol.code": codeUpper,
      });

      if (symbolConflict) {
        return res.status(400).json({
          success: false,
          message: `The symbol '${assignedSymbol.name || codeUpper}' is already assigned to another candidate for this position in this election.`,
        });
      }

      candidate.assignedSymbol = {
        name: assignedSymbol.name ? assignedSymbol.name.trim() : candidate.assignedSymbol?.name || "Official Symbol",
        code: codeUpper,
        icon: assignedSymbol.icon || candidate.assignedSymbol?.icon || "🗳️",
        description: assignedSymbol.description || candidate.assignedSymbol?.description || "",
      };
    }

    candidate.adminApproval = {
      status: "approved",
      approvedBy: req.user._id,
      approvedAt: new Date(),
    };

    // Check if Supervisor has also approved
    if (candidate.supervisorApproval?.status === "approved") {
      candidate.approvalStatus = "approved";
      candidate.isApproved = true;
      candidate.approvedAt = new Date();
      candidate.approvedBy = req.user._id;

      const candidateUserId = candidate.candidateId || candidate.studentId;
      if (candidateUserId) {
        await User.findByIdAndUpdate(candidateUserId, { role: ROLES.CANDIDATE });
      }
    } else {
      candidate.approvalStatus = "pending";
      candidate.isApproved = false;
    }

    await candidate.save();

    if (candidate.applicationId) {
      await CandidateApplication.findByIdAndUpdate(candidate.applicationId, {
        ...(candidate.approvalStatus === "approved" ? { status: APPLICATION_STATUS.APPROVED } : {}),
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
        reviewComment: reviewComment || "Approved by Administrator.",
        ...(candidate.assignedSymbol ? { assignedSymbol: candidate.assignedSymbol } : {}),
      });
    }

    await logAudit(req, "CANDIDATE_ADMIN_APPROVED", "CandidateProfile", candidate._id, {
      candidateId: candidate.candidateId,
      overallStatus: candidate.approvalStatus,
    });

    const populated = await CandidateProfile.findById(candidate._id)
      .populate("candidateId", "name email regNo department year academicPercentage phone")
      .populate("studentId", "name email regNo department year academicPercentage phone")
      .populate("positionId", "title minAcademicPercentage")
      .populate("electionId", "title status")
      .lean();

    if (populated) {
      populated.studentId = populated.studentId || populated.candidateId;
    }

    return res.status(200).json({
      success: true,
      message:
        candidate.approvalStatus === "approved"
          ? "Candidate approved by Admin and fully approved by both authorities."
          : "Admin approval recorded. Awaiting Supervisor approval.",
      data: populated || candidate,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Supervisor Approve Candidate (Two-Level Workflow)
// @route PUT /api/candidates/:id/supervisor-approve
// @access Private (Supervisor)
const supervisorApproveCandidate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { assignedSymbol, reviewComment } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid candidate ID.",
      });
    }

    let candidate = await CandidateProfile.findById(id);
    if (!candidate) {
      candidate = await CandidateProfile.findOne({ applicationId: id });
    }

    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: "Candidate not found.",
      });
    }

    if (candidate.supervisorApproval?.status === "approved") {
      return res.status(400).json({
        success: false,
        message: "Candidate has already been approved by Supervisor.",
      });
    }

    if (assignedSymbol && assignedSymbol.code) {
      const codeUpper = assignedSymbol.code.toUpperCase().trim();
      const symbolConflict = await CandidateProfile.findOne({
        _id: { $ne: candidate._id },
        electionId: candidate.electionId,
        positionId: candidate.positionId,
        approvalStatus: "approved",
        "assignedSymbol.code": codeUpper,
      });

      if (symbolConflict) {
        return res.status(400).json({
          success: false,
          message: `The symbol '${assignedSymbol.name || codeUpper}' is already assigned to another candidate for this position in this election.`,
        });
      }

      candidate.assignedSymbol = {
        name: assignedSymbol.name ? assignedSymbol.name.trim() : candidate.assignedSymbol?.name || "Official Symbol",
        code: codeUpper,
        icon: assignedSymbol.icon || candidate.assignedSymbol?.icon || "🗳️",
        description: assignedSymbol.description || candidate.assignedSymbol?.description || "",
      };
    }

    candidate.supervisorApproval = {
      status: "approved",
      approvedBy: req.user._id,
      approvedAt: new Date(),
    };

    // Check if Admin has also approved
    if (candidate.adminApproval?.status === "approved") {
      candidate.approvalStatus = "approved";
      candidate.isApproved = true;
      candidate.approvedAt = new Date();
      candidate.approvedBy = req.user._id;

      const candidateUserId = candidate.candidateId || candidate.studentId;
      if (candidateUserId) {
        await User.findByIdAndUpdate(candidateUserId, { role: ROLES.CANDIDATE });
      }
    } else {
      candidate.approvalStatus = "pending";
      candidate.isApproved = false;
    }

    await candidate.save();

    if (candidate.applicationId) {
      await CandidateApplication.findByIdAndUpdate(candidate.applicationId, {
        ...(candidate.approvalStatus === "approved" ? { status: APPLICATION_STATUS.APPROVED } : {}),
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
        reviewComment: reviewComment || "Approved by Supervisor.",
        ...(candidate.assignedSymbol ? { assignedSymbol: candidate.assignedSymbol } : {}),
      });
    }

    await logAudit(req, "CANDIDATE_SUPERVISOR_APPROVED", "CandidateProfile", candidate._id, {
      candidateId: candidate.candidateId,
      overallStatus: candidate.approvalStatus,
    });

    const populated = await CandidateProfile.findById(candidate._id)
      .populate("candidateId", "name email regNo department year academicPercentage phone")
      .populate("studentId", "name email regNo department year academicPercentage phone")
      .populate("positionId", "title minAcademicPercentage")
      .populate("electionId", "title status")
      .lean();

    if (populated) {
      populated.studentId = populated.studentId || populated.candidateId;
    }

    return res.status(200).json({
      success: true,
      message:
        candidate.approvalStatus === "approved"
          ? "Candidate approved by Supervisor and fully approved by both authorities."
          : "Supervisor approval recorded. Awaiting Admin approval.",
      data: populated || candidate,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Admin Reject Candidate
// @route PUT /api/candidates/:id/admin-reject
// @access Private (Admin)
const adminRejectCandidate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rejectionReason, reviewComment } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid candidate ID.",
      });
    }

    let candidate = await CandidateProfile.findById(id);
    if (!candidate) {
      candidate = await CandidateProfile.findOne({ applicationId: id });
    }

    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: "Candidate not found.",
      });
    }

    const reason = rejectionReason || reviewComment || "Rejected by Administrator.";
    candidate.adminApproval = {
      status: "rejected",
      approvedBy: req.user._id,
      approvedAt: new Date(),
    };
    candidate.approvalStatus = "rejected";
    candidate.isApproved = false;
    candidate.rejectionReason = reason;
    candidate.rejectedBy = req.user._id;
    candidate.rejectedAt = new Date();

    await candidate.save();

    if (candidate.applicationId) {
      await CandidateApplication.findByIdAndUpdate(candidate.applicationId, {
        status: APPLICATION_STATUS.REJECTED,
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
        reviewComment: reason,
      });
    }

    await logAudit(req, "CANDIDATE_ADMIN_REJECTED", "CandidateProfile", candidate._id, {
      candidateId: candidate.candidateId,
      reason,
    });

    return res.status(200).json({
      success: true,
      message: "Candidate rejected by Administrator.",
      data: candidate,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Supervisor Reject Candidate
// @route PUT /api/candidates/:id/supervisor-reject
// @access Private (Supervisor)
const supervisorRejectCandidate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rejectionReason, reviewComment } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid candidate ID.",
      });
    }

    let candidate = await CandidateProfile.findById(id);
    if (!candidate) {
      candidate = await CandidateProfile.findOne({ applicationId: id });
    }

    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: "Candidate not found.",
      });
    }

    const reason = rejectionReason || reviewComment || "Rejected by Supervisor.";
    candidate.supervisorApproval = {
      status: "rejected",
      approvedBy: req.user._id,
      approvedAt: new Date(),
    };
    candidate.approvalStatus = "rejected";
    candidate.isApproved = false;
    candidate.rejectionReason = reason;
    candidate.rejectedBy = req.user._id;
    candidate.rejectedAt = new Date();

    await candidate.save();

    if (candidate.applicationId) {
      await CandidateApplication.findByIdAndUpdate(candidate.applicationId, {
        status: APPLICATION_STATUS.REJECTED,
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
        reviewComment: reason,
      });
    }

    await logAudit(req, "CANDIDATE_SUPERVISOR_REJECTED", "CandidateProfile", candidate._id, {
      candidateId: candidate.candidateId,
      reason,
    });

    return res.status(200).json({
      success: true,
      message: "Candidate rejected by Supervisor.",
      data: candidate,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Student Apply as Candidate
// @route POST /api/candidates
// @access Private (Student, Candidate)
const applyCandidate = async (req, res, next) => {
  try {
    const { electionId, positionId, manifesto, plannedWork, preferredSymbol, candidateId } = req.body;

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

    // Eligibility check
    const candidatePercentage = Number(candidateUser.academicPercentage) || 0;
    const requiredPercentage = Number(position.minAcademicPercentage) || 70;
    if (candidatePercentage < requiredPercentage) {
      return res.status(400).json({
        success: false,
        message: `Eligibility check failed: Candidate academic percentage (${candidatePercentage}%) is lower than minimum requirement (${requiredPercentage}%) for '${position.title}'.`,
      });
    }

    // Check duplicate
    const existing = await CandidateProfile.findOne({
      electionId,
      positionId,
      $or: [{ candidateId: targetUserId }, { studentId: targetUserId }],
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "You have already submitted an eligibility application for this position.",
      });
    }

    // Match symbol or assign pending placeholder
    const matchedSymbol = SUPPORTED_SYMBOLS.find(
      (s) =>
        s.name.toLowerCase() === (preferredSymbol || "").toLowerCase() ||
        s.code.toLowerCase() === (preferredSymbol || "").toLowerCase()
    );

    const initialSymbol = matchedSymbol
      ? { ...matchedSymbol }
      : {
          name: preferredSymbol || "Pending Assignment",
          code: preferredSymbol ? preferredSymbol.toUpperCase().replace(/\s+/g, "_") : `PENDING_${Date.now()}`,
          icon: "🗳️",
          description: "",
        };

    // Create CandidateApplication
    const application = await CandidateApplication.create({
      electionId,
      positionId,
      candidateId: targetUserId,
      manifesto: manifesto || "",
      plannedWork: Array.isArray(plannedWork) ? plannedWork : plannedWork ? [plannedWork] : [],
      preferredSymbol: preferredSymbol || "",
      status: APPLICATION_STATUS.PENDING,
    });

    // Create CandidateProfile with pending approvalStatus and two-level approval structures
    const profile = await CandidateProfile.create({
      electionId,
      positionId,
      candidateId: targetUserId,
      studentId: targetUserId,
      applicationId: application._id,
      assignedSymbol: initialSymbol,
      manifesto: manifesto || "",
      plannedWork: Array.isArray(plannedWork) ? plannedWork : plannedWork ? [plannedWork] : [],
      approvalStatus: "pending",
      adminApproval: {
        status: "pending",
        approvedBy: null,
        approvedAt: null,
      },
      supervisorApproval: {
        status: "pending",
        approvedBy: null,
        approvedAt: null,
      },
      isApproved: false,
    });

    await logAudit(
      req,
      "CANDIDATE_APPLICATION_SUBMITTED",
      "CandidateProfile",
      profile._id,
      { candidateName: candidateUser.name, position: position.title }
    );

    res.status(201).json({
      success: true,
      message: "Nomination application submitted successfully and is pending review.",
      data: profile,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "You have already submitted an eligibility application for this position.",
      });
    }
    next(error);
  }
};

// @desc Get Candidate Application Status for Logged-In User
// @route GET /api/candidates/status
// @access Private (Student, Candidate)
const getCandidateApplicationStatus = async (req, res, next) => {
  try {
    const profile = await CandidateProfile.findOne({
      $or: [{ candidateId: req.user._id }, { studentId: req.user._id }],
    })
      .populate("candidateId", "name email regNo department year academicPercentage phone")
      .populate("studentId", "name email regNo department year academicPercentage phone")
      .populate("positionId", "title minAcademicPercentage description")
      .populate("electionId", "title status startDate endDate")
      .populate("adminApproval.approvedBy", "name role")
      .populate("supervisorApproval.approvedBy", "name role")
      .lean();

    if (!profile) {
      return res.status(200).json({
        success: true,
        hasApplication: false,
        message: "No candidate application found for this user.",
        data: null,
      });
    }

    profile.studentId = profile.studentId || profile.candidateId;

    return res.status(200).json({
      success: true,
      hasApplication: true,
      approvalStatus: profile.approvalStatus,
      adminApproval: profile.adminApproval,
      supervisorApproval: profile.supervisorApproval,
      rejectionReason: profile.rejectionReason,
      isApproved: profile.approvalStatus === "approved",
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Get Candidate's Own Profile (Restricted to APPROVED candidates)
// @route GET /api/candidates/me
// @access Private (Candidate)
const getMyCandidateProfile = async (req, res, next) => {
  try {
    const query = {
      $or: [{ candidateId: req.user._id }, { studentId: req.user._id }],
    };
    if (req.query.electionId) {
      query.electionId = req.query.electionId;
    }

    // Prioritize approved profile if multiple nominations exist, otherwise latest
    let profile = await CandidateProfile.findOne({ ...query, approvalStatus: "approved" })
      .sort({ createdAt: -1 })
      .populate("candidateId", "name email regNo department year academicPercentage phone")
      .populate("studentId", "name email regNo department year academicPercentage phone")
      .populate("positionId", "title minAcademicPercentage description")
      .populate("electionId", "title status startDate endDate")
      .populate("adminApproval.approvedBy", "name role")
      .populate("supervisorApproval.approvedBy", "name role")
      .lean();

    if (!profile) {
      profile = await CandidateProfile.findOne(query)
        .sort({ createdAt: -1 })
        .populate("candidateId", "name email regNo department year academicPercentage phone")
        .populate("studentId", "name email regNo department year academicPercentage phone")
        .populate("positionId", "title minAcademicPercentage description")
        .populate("electionId", "title status startDate endDate")
        .populate("adminApproval.approvedBy", "name role")
        .populate("supervisorApproval.approvedBy", "name role")
        .lean();
    }

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "No candidate application found for this user.",
      });
    }

    // Protect Candidate Dashboard: verify approvalStatus === "approved"
    if (profile.approvalStatus !== "approved" && req.query.allowPending !== "true") {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Candidate dashboard is restricted to approved candidates only.",
        approvalStatus: profile.approvalStatus,
        adminApproval: profile.adminApproval,
        supervisorApproval: profile.supervisorApproval,
        rejectionReason: profile.rejectionReason,
      });
    }

    profile.studentId = profile.studentId || profile.candidateId;

    res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Update Candidate Profile (Manifesto, Planned Work, Photo)
// @route PUT /api/candidates/profile
// @access Private (Candidate)
const updateMyProfile = async (req, res, next) => {
  try {
    const { manifesto, plannedWork, photoUrl } = req.body;

    let profile = await CandidateProfile.findOne({
      $or: [{ candidateId: req.user._id }, { studentId: req.user._id }],
    });
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Candidate profile not found.",
      });
    }

    if (manifesto !== undefined) profile.manifesto = manifesto;
    if (plannedWork !== undefined) {
      profile.plannedWork = Array.isArray(plannedWork)
        ? plannedWork
        : [plannedWork];
    }
    if (photoUrl !== undefined) profile.photoUrl = photoUrl;

    await profile.save();
    await logAudit(req, "CANDIDATE_PROFILE_UPDATED", "CandidateProfile", profile._id);

    res.status(200).json({
      success: true,
      message: "Candidate profile updated successfully.",
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Admin / Supervisor Direct Nomination of a Candidate
// @route POST /api/candidates/nominate
// @access Private (Admin & Supervisor)
const directNominate = async (req, res, next) => {
  try {
    const {
      electionId,
      positionId,
      candidateId,
      assignedSymbol,
      manifesto,
      plannedWork,
      photoUrl,
    } = req.body;

    if (!electionId || !positionId || !candidateId || !assignedSymbol || !assignedSymbol.name || !assignedSymbol.code) {
      return res.status(400).json({
        success: false,
        message: "electionId, positionId, candidateId, and assignedSymbol are required.",
      });
    }

    const candidateUser = await User.findById(candidateId);
    if (!candidateUser) {
      return res.status(404).json({
        success: false,
        message: "Candidate user not found.",
      });
    }

    const position = await ElectionPosition.findOne({ _id: positionId, electionId });
    if (!position) {
      return res.status(404).json({
        success: false,
        message: "Position not found in this election.",
      });
    }

    // Server-side academic eligibility check
    const candidateScore = Number(candidateUser.academicPercentage) || 0;
    const requiredScore = Number(position.minAcademicPercentage) || 70;
    if (candidateScore < requiredScore) {
      return res.status(400).json({
        success: false,
        message: `Ineligible: Candidate's percentage (${candidateScore}%) is below the requirement (${requiredScore}%) for '${position.title}'.`,
      });
    }

    // Check symbol conflict
    const symbolConflict = await CandidateProfile.findOne({
      electionId,
      positionId,
      approvalStatus: "approved",
      "assignedSymbol.code": assignedSymbol.code.toUpperCase().trim(),
    });

    if (symbolConflict) {
      return res.status(400).json({
        success: false,
        message: `The symbol '${assignedSymbol.name}' is already taken for this position.`,
      });
    }

    const profile = await CandidateProfile.create({
      electionId,
      positionId,
      candidateId,
      studentId: candidateId,
      assignedSymbol: {
        name: assignedSymbol.name.trim(),
        code: assignedSymbol.code.toUpperCase().trim(),
        icon: assignedSymbol.icon || "🗳️",
        description: assignedSymbol.description || "",
      },
      manifesto: manifesto || "",
      plannedWork: Array.isArray(plannedWork) ? plannedWork : [],
      photoUrl: photoUrl || "",
      approvalStatus: "approved",
      isApproved: true,
      approvedAt: new Date(),
      approvedBy: req.user ? req.user._id : null,
    });

    // Ensure user role is CANDIDATE
    await User.findByIdAndUpdate(candidateId, { role: ROLES.CANDIDATE });

    await logAudit(req, "DIRECT_CANDIDATE_NOMINATED", "CandidateProfile", profile._id, {
      candidateName: candidateUser.name,
      symbol: profile.assignedSymbol.name,
    });

    res.status(201).json({
      success: true,
      message: "Candidate nominated and approved successfully.",
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Delete / Remove Candidate Nomination
// @route DELETE /api/candidates/:id
// @access Private (Admin & Supervisor)
const deleteCandidate = async (req, res, next) => {
  try {
    const profile = await CandidateProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Candidate profile not found.",
      });
    }

    if (profile.applicationId) {
      await CandidateApplication.findByIdAndDelete(profile.applicationId);
    }
    await CandidateProfile.findByIdAndDelete(req.params.id);
    await logAudit(req, "CANDIDATE_NOMINATION_DELETED", "CandidateProfile", req.params.id);

    res.status(200).json({
      success: true,
      message: "Candidate nomination removed successfully.",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCandidates,
  getPendingCandidates,
  approveCandidate,
  rejectCandidate,
  adminApproveCandidate,
  supervisorApproveCandidate,
  adminRejectCandidate,
  supervisorRejectCandidate,
  applyCandidate,
  getCandidateApplicationStatus,
  getMyCandidateProfile,
  updateMyProfile,
  directNominate,
  deleteCandidate,
};
