const mongoose = require("mongoose");
const Vote = require("../models/Vote");
const VoteReceipt = require("../models/VoteReceipt");
const Election = require("../models/Election");
const ElectionPosition = require("../models/ElectionPosition");
const CandidateProfile = require("../models/CandidateProfile");
const { ELECTION_STATUS, ROLES } = require("../config/constants");
const { logAudit } = require("../utils/auditLogger");

// @desc Submit Vote (Secret Ballot)
// @route POST /api/votes
// @access Private (Student or Candidate)
const submitVote = async (req, res, next) => {
  try {
    const { electionId, positionId, candidateId } = req.body;
    const voterId = req.user._id;

    if (!electionId || !positionId || !candidateId) {
      return res.status(400).json({
        success: false,
        message: "electionId, positionId, and candidateId are required to cast a ballot.",
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(electionId) ||
      !mongoose.Types.ObjectId.isValid(positionId) ||
      !mongoose.Types.ObjectId.isValid(candidateId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid election, position, or candidate ID format.",
      });
    }

    // 1. Verify Election
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found.",
      });
    }

    // 1. Verify Election is ACTIVE
    if (election.status !== ELECTION_STATUS.ACTIVE) {
      return res.status(400).json({
        success: false,
        message: "Voting is not currently active for this election.",
      });
    }

    // Check if scheduled end date has elapsed
    const now = new Date();
    if (election.endDate && now > new Date(election.endDate)) {
      return res.status(400).json({
        success: false,
        message: "Voting has ended for this election.",
      });
    }

    // 2. Verify Position belongs to this election
    const position = await ElectionPosition.findOne({ _id: positionId, electionId });
    if (!position) {
      return res.status(400).json({
        success: false,
        message: "Position not found or does not belong to this election.",
      });
    }

    // 3. Verify Candidate exists, belongs to this election & position, and is approved
    let candidateProfile = await CandidateProfile.findOne({
      _id: candidateId,
      electionId,
      positionId,
    });

    if (!candidateProfile) {
      candidateProfile = await CandidateProfile.findOne({
        $or: [{ candidateId: candidateId }, { studentId: candidateId }],
        electionId,
        positionId,
      });
    }

    if (!candidateProfile) {
      return res.status(400).json({
        success: false,
        message: "Candidate is not approved or does not belong to this election/position",
      });
    }

    // Enforce approval status strictly - pending or rejected candidates are forbidden
    const isApproved =
      candidateProfile.approvalStatus === "approved" ||
      (candidateProfile.isApproved === true && candidateProfile.approvalStatus !== "rejected" && candidateProfile.approvalStatus !== "pending");

    if (!isApproved) {
      return res.status(400).json({
        success: false,
        message: "Candidate is not approved or does not belong to this election/position",
      });
    }

    // 4. Check Self-Voting Restriction if configured
    const candidateUserId = (candidateProfile.candidateId || candidateProfile.studentId || "").toString();
    if (!election.isSelfVotingAllowed && candidateUserId === voterId.toString()) {
      return res.status(400).json({
        success: false,
        message: "Self-voting is not permitted in this election.",
      });
    }

    // 5. Check if student already voted for this position (pre-check before atomic insert)
    const existingReceipt = await VoteReceipt.findOne({
      studentId: voterId,
      electionId,
      positionId,
    });

    if (existingReceipt) {
      return res.status(400).json({
        success: false,
        message: "You have already cast your vote for this position.",
      });
    }

    // 6. Atomic creation of VoteReceipt to lock in participation and prevent duplicate votes
    let receipt;
    try {
      receipt = await VoteReceipt.create({
        studentId: voterId,
        electionId,
        positionId,
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(400).json({
          success: false,
          message: "You have already cast your vote for this position.",
        });
      }
      throw err;
    }

    // 7. Store Anonymized Ballot (NO student/voter reference)
    await Vote.create({
      electionId,
      positionId,
      candidateId,
    });

    // 8. Privacy-preserving audit event (records THAT a ballot was cast, NOT who was selected)
    await logAudit(
      req,
      "VOTE_ACCEPTED",
      "ElectionPosition",
      position._id,
      {
        electionTitle: election.title,
        positionTitle: position.title,
        receiptId: receipt.receiptId,
      }
    );

    const receiptPayload = {
      receiptId: receipt.receiptId,
      electionId: election._id,
      electionTitle: election.title,
      positionId: position._id,
      positionTitle: position.title,
      timestamp: receipt.createdAt,
    };

    res.status(201).json({
      success: true,
      message: "Your vote has been securely recorded.",
      data: receiptPayload,
      receipt: receiptPayload,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Get Student's Personal Vote Receipts / History
// @route GET /api/votes/my-receipts
// @access Private (Student / Candidate)
const getMyReceipts = async (req, res, next) => {
  try {
    const receipts = await VoteReceipt.find({ studentId: req.user._id })
      .populate("electionId", "title status startDate endDate")
      .populate("positionId", "title")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: receipts,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Get Anonymized Election Vote Turnout & Counts (Privacy-Preserving)
// @route GET /api/votes/turnout/:electionId
// @access Private (Admin, Supervisor)
const getElectionTurnout = async (req, res, next) => {
  try {
    const { electionId } = req.params;

    const totalStudents = await require("../models/User").countDocuments({ role: ROLES.STUDENT });
    const totalBallots = await Vote.countDocuments({ electionId });

    // Distinct voters count
    const distinctVoters = await VoteReceipt.distinct("studentId", { electionId });
    const turnoutPercentage = totalStudents > 0 ? ((distinctVoters.length / totalStudents) * 100).toFixed(1) : 0;

    const positions = await ElectionPosition.find({ electionId }).sort({ order: 1 }).lean();

    const positionStats = await Promise.all(
      positions.map(async (pos) => {
        const votesCount = await Vote.countDocuments({ electionId, positionId: pos._id });
        return {
          positionId: pos._id,
          positionTitle: pos.title,
          votesCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        totalStudents,
        totalBallots,
        distinctVoterCount: distinctVoters.length,
        turnoutPercentage: Number(turnoutPercentage),
        positionStats,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitVote,
  getMyReceipts,
  getElectionTurnout,
};
