const User = require("../models/User");
const Election = require("../models/Election");
const CandidateProfile = require("../models/CandidateProfile");
const CandidateApplication = require("../models/CandidateApplication");
const Vote = require("../models/Vote");
const VoteReceipt = require("../models/VoteReceipt");
const AuditLog = require("../models/AuditLog");
const { ROLES, ELECTION_STATUS } = require("../config/constants");

// @desc Get Supervisor Dashboard
// @route GET /api/supervisor/dashboard
// @access Private (Supervisor & Admin)
const getSupervisorDashboard = async (req, res, next) => {
  try {
    const totalStudents = await User.countDocuments({ role: ROLES.STUDENT });
    const approvedCandidates = await CandidateProfile.countDocuments({ isApproved: true });
    const activeElections = await Election.countDocuments({ status: ELECTION_STATUS.ACTIVE });
    const totalVotes = await Vote.countDocuments();
    const pendingApplications = await CandidateApplication.countDocuments({ status: "pending" });

    // Distinct students who voted
    const distinctVoterIds = await VoteReceipt.distinct("studentId");
    const turnoutRate = totalStudents > 0 ? ((distinctVoterIds.length / totalStudents) * 100).toFixed(1) : 0;

    const monitoredElections = await Election.find({
      status: { $in: [ELECTION_STATUS.UPCOMING, ELECTION_STATUS.ACTIVE, ELECTION_STATUS.CLOSED] },
    })
      .sort({ startDate: 1 })
      .lean();

    const electionsWithTurnout = await Promise.all(
      monitoredElections.map(async (el) => {
        const elVotes = await Vote.countDocuments({ electionId: el._id });
        const distinctVoters = await VoteReceipt.distinct("studentId", { electionId: el._id });
        return {
          ...el,
          totalVotes: elVotes,
          distinctVoters: distinctVoters.length,
          turnoutPercent: totalStudents > 0 ? ((distinctVoters.length / totalStudents) * 100).toFixed(1) : 0,
        };
      })
    );

    // Recent privacy-preserving audit logs
    const recentAuditLogs = await AuditLog.find({
      action: { $in: ["VOTE_ACCEPTED", "CANDIDATE_APPLICATION_SUBMITTED", "CANDIDATE_APPLICATION_APPROVED", "CANDIDATE_APPLICATION_REJECTED", "ELECTION_STATUS_CHANGED"] },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.status(200).json({
      success: true,
      data: {
        totalStudents,
        approvedCandidates,
        activeElections,
        totalVotes,
        pendingApplications,
        turnoutRate: Number(turnoutRate),
        monitoredElections: electionsWithTurnout,
        recentAuditLogs,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc Get Privacy-Preserving Voting Activity Logs (Proof of Ballot Submission without candidate disclosure)
// @route GET /api/supervisor/vote-monitoring
// @access Private (Supervisor & Admin)
const getVoteMonitoringLogs = async (req, res, next) => {
  try {
    const { electionId, search = "" } = req.query;
    const query = {};

    if (electionId) query.electionId = electionId;

    const receipts = await VoteReceipt.find(query)
      .populate("studentId", "name regNo department year")
      .populate("electionId", "title status")
      .populate("positionId", "title")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    // Map into privacy-preserving format:
    // Only student participation details + receipt hash + timestamp + status "Verified Ballot"
    // CANDIDATE SELECTION IS NEVER EXPOSED.
    const privacyPreservingLogs = receipts
      .filter((r) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          r.studentId?.name?.toLowerCase().includes(q) ||
          r.studentId?.regNo?.toLowerCase().includes(q) ||
          r.receiptId?.toLowerCase().includes(q)
        );
      })
      .map((r) => ({
        id: r._id,
        receiptId: r.receiptId,
        studentName: r.studentId ? r.studentId.name : "Anonymous Voter",
        regNo: r.studentId ? r.studentId.regNo : "N/A",
        department: r.studentId ? r.studentId.department : "N/A",
        election: r.electionId ? r.electionId.title : "N/A",
        position: r.positionId ? r.positionId.title : "N/A",
        timestamp: r.createdAt,
        status: "Verified Ballot",
      }));

    res.status(200).json({
      success: true,
      data: privacyPreservingLogs,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSupervisorDashboard,
  getVoteMonitoringLogs,
};
