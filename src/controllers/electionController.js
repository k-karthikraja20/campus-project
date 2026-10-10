const mongoose = require("mongoose");
const Election = require("../models/Election");
const ElectionPosition = require("../models/ElectionPosition");
const CandidateProfile = require("../models/CandidateProfile");
const { ELECTION_STATUS, ROLES } = require("../config/constants");
const { logAudit } = require("../utils/auditLogger");

// @desc Get All Elections
// @route GET /api/elections
// @access Public / Authenticated
const getElections = async (req, res, next) => {
  try {
    const userRole = req.user?.role;
    let filter = {};

    // Students and unauthenticated visitors should not see draft elections
    if (userRole === ROLES.STUDENT || userRole === ROLES.CANDIDATE || !userRole) {
      filter.status = { $ne: ELECTION_STATUS.DRAFT };
    }

    const elections = await Election.find(filter).sort({ startDate: 1 }).lean();

    // Populate positions count for each election
    const electionsWithDetails = await Promise.all(
      elections.map(async (el) => {
        const positions = await ElectionPosition.find({ electionId: el._id }).sort({ order: 1 }).lean();
        const candidateCount = await CandidateProfile.countDocuments({ electionId: el._id, isApproved: true });
        return {
          ...el,
          positions,
          candidateCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: electionsWithDetails,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Get Active Elections with Positions
// @route GET /api/elections/active
// @access Public / Authenticated
const getActiveElections = async (req, res, next) => {
  try {
    const elections = await Election.find({ status: ELECTION_STATUS.ACTIVE })
      .select("_id title description status startDate endDate")
      .sort({ startDate: 1 })
      .lean();

    // Populate positions for each active election
    const electionsWithPositions = await Promise.all(
      elections.map(async (el) => {
        const positions = await ElectionPosition.find({ electionId: el._id })
          .select("_id title description minAcademicPercentage order")
          .sort({ order: 1, title: 1 })
          .lean();

        return {
          _id: el._id,
          title: el.title,
          status: el.status,
          description: el.description,
          startDate: el.startDate,
          endDate: el.endDate,
          positions,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: electionsWithPositions.length,
      data: electionsWithPositions,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Get Single Election by ID
// @route GET /api/elections/:id
// @access Public / Authenticated
const getElectionById = async (req, res, next) => {
  try {
    const election = await Election.findById(req.params.id).lean();
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found.",
      });
    }

    const positions = await ElectionPosition.find({ electionId: election._id })
      .sort({ order: 1 })
      .lean();

    const positionsWithCandidates = await Promise.all(
      positions.map(async (pos) => {
        const candidates = await CandidateProfile.find({
          electionId: election._id,
          positionId: pos._id,
          isApproved: true,
        })
          .populate("candidateId", "name email regNo department year academicPercentage")
          .lean();

        return {
          ...pos,
          candidates,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        ...election,
        positions: positionsWithCandidates,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc Create Election
// @route POST /api/elections
// @access Private (Admin only)
const createElection = async (req, res, next) => {
  try {
    const { title, description, startDate, endDate, status, isSelfVotingAllowed, positions } = req.body;

    if (!title || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Title, startDate, and endDate are required.",
      });
    }

    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({
        success: false,
        message: "Election end date must be after the start date.",
      });
    }

    const election = await Election.create({
      title,
      description: description || "",
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: status || ELECTION_STATUS.DRAFT,
      isSelfVotingAllowed: Boolean(isSelfVotingAllowed),
      createdBy: req.user._id,
    });

    // Create initial positions if provided
    if (Array.isArray(positions) && positions.length > 0) {
      for (const pos of positions) {
        if (pos.title) {
          await ElectionPosition.create({
            electionId: election._id,
            title: pos.title,
            description: pos.description || "",
            minAcademicPercentage: Number(pos.minAcademicPercentage) || 70,
            order: Number(pos.order) || 0,
          });
        }
      }
    }

    await logAudit(req, "ELECTION_CREATED", "Election", election._id, { title: election.title });

    res.status(201).json({
      success: true,
      message: "Election created successfully.",
      data: election,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Update Election
// @route PUT /api/elections/:id
// @access Private (Admin only)
const updateElection = async (req, res, next) => {
  try {
    const { title, description, startDate, endDate, status, isSelfVotingAllowed } = req.body;

    const election = await Election.findById(req.params.id);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found.",
      });
    }

    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({
        success: false,
        message: "Election end date must be after the start date.",
      });
    }

    if (title) election.title = title;
    if (description !== undefined) election.description = description;
    if (startDate) election.startDate = new Date(startDate);
    if (endDate) election.endDate = new Date(endDate);
    if (status) election.status = status;
    if (isSelfVotingAllowed !== undefined) election.isSelfVotingAllowed = Boolean(isSelfVotingAllowed);

    await election.save();
    await logAudit(req, "ELECTION_UPDATED", "Election", election._id, { status: election.status });

    res.status(200).json({
      success: true,
      message: "Election updated successfully.",
      data: election,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Delete Election
// @route DELETE /api/elections/:id
// @access Private (Admin only)
const deleteElection = async (req, res, next) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found.",
      });
    }

    await ElectionPosition.deleteMany({ electionId: election._id });
    await CandidateProfile.deleteMany({ electionId: election._id });
    await Election.findByIdAndDelete(req.params.id);

    await logAudit(req, "ELECTION_DELETED", "Election", req.params.id, { title: election.title });

    res.status(200).json({
      success: true,
      message: "Election and associated positions deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};

// @desc Change Election Status
// @route PATCH /api/elections/:id/status
// @access Private (Admin & Supervisor)
const changeStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!Object.values(ELECTION_STATUS).includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed values: ${Object.values(ELECTION_STATUS).join(", ")}`,
      });
    }

    const election = await Election.findById(req.params.id);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found.",
      });
    }

    election.status = status;
    if (status === ELECTION_STATUS.PUBLISHED) {
      election.isResultsPublished = true;
      election.publishedAt = new Date();
    }

    await election.save();
    await logAudit(req, "ELECTION_STATUS_CHANGED", "Election", election._id, { newStatus: status });

    res.status(200).json({
      success: true,
      message: `Election status transitioned to ${status}.`,
      data: election,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Publish Election Results
// @route POST /api/elections/:id/publish-results
// @access Private (Admin only)
const publishResults = async (req, res, next) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found.",
      });
    }

    election.status = ELECTION_STATUS.PUBLISHED;
    election.isResultsPublished = true;
    election.publishedAt = new Date();
    await election.save();

    await logAudit(req, "ELECTION_RESULTS_PUBLISHED", "Election", election._id, { title: election.title });

    res.status(200).json({
      success: true,
      message: "Election results published successfully.",
      data: election,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Add Position to Election
// @route POST /api/elections/:id/positions
// @access Private (Admin only)
const addPosition = async (req, res, next) => {
  try {
    const { title, description, minAcademicPercentage, order } = req.body;

    const election = await Election.findById(req.params.id);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found.",
      });
    }

    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Position title is required.",
      });
    }

    const existing = await ElectionPosition.findOne({ electionId: election._id, title: title.trim() });
    if (existing) {
      return res.status(201).json({
        success: true,
        message: "Position already exists in this election.",
        data: existing,
      });
    }

    const position = await ElectionPosition.create({
      electionId: election._id,
      title: title.trim(),
      description: description || "",
      minAcademicPercentage: Number(minAcademicPercentage) || 70,
      order: Number(order) || 0,
    });

    await logAudit(req, "POSITION_ADDED", "ElectionPosition", position._id, {
      title: position.title,
      minAcademicPercentage: position.minAcademicPercentage,
    });

    res.status(201).json({
      success: true,
      message: "Position added successfully.",
      data: position,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Update Position
// @route PUT /api/elections/:id/positions/:positionId
// @access Private (Admin only)
const updatePosition = async (req, res, next) => {
  try {
    const { title, description, minAcademicPercentage, order } = req.body;

    const position = await ElectionPosition.findOne({
      _id: req.params.positionId,
      electionId: req.params.id,
    });

    if (!position) {
      return res.status(404).json({
        success: false,
        message: "Position not found in this election.",
      });
    }

    if (title) position.title = title.trim();
    if (description !== undefined) position.description = description;
    if (minAcademicPercentage !== undefined) position.minAcademicPercentage = Number(minAcademicPercentage);
    if (order !== undefined) position.order = Number(order);

    await position.save();
    await logAudit(req, "POSITION_UPDATED", "ElectionPosition", position._id, { title: position.title });

    res.status(200).json({
      success: true,
      message: "Position updated successfully.",
      data: position,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Delete Position
// @route DELETE /api/elections/:id/positions/:positionId
// @access Private (Admin only)
const deletePosition = async (req, res, next) => {
  try {
    const position = await ElectionPosition.findOneAndDelete({
      _id: req.params.positionId,
      electionId: req.params.id,
    });

    if (!position) {
      return res.status(404).json({
        success: false,
        message: "Position not found in this election.",
      });
    }

    await CandidateProfile.deleteMany({ positionId: req.params.positionId });
    await logAudit(req, "POSITION_DELETED", "ElectionPosition", req.params.positionId);

    res.status(200).json({
      success: true,
      message: "Position deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};

// @desc Get Positions for an Election
// @route GET /api/elections/:electionId/positions
// @access Public / Authenticated
const getPositionsByElection = async (req, res, next) => {
  try {
    const electionId = req.params.electionId || req.params.id;

    if (!mongoose.Types.ObjectId.isValid(electionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid election ID.",
      });
    }

    const election = await Election.findById(electionId).lean();
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found.",
      });
    }

    const positions = await ElectionPosition.find({ electionId }).sort({ order: 1 }).lean();

    return res.status(200).json({
      success: true,
      count: positions.length,
      data: positions,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getElections,
  getActiveElections,
  getElectionById,
  getPositionsByElection,
  createElection,
  updateElection,
  deleteElection,
  changeStatus,
  publishResults,
  addPosition,
  updatePosition,
  deletePosition,
};

