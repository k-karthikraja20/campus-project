const Election = require("../models/Election");
const ElectionPosition = require("../models/ElectionPosition");
const CandidateProfile = require("../models/CandidateProfile");
const Vote = require("../models/Vote");
const { ELECTION_STATUS, ROLES } = require("../config/constants");
const { logAudit } = require("../utils/auditLogger");

// Helper to compute dynamic results from Vote collection using exact counts
const computeElectionResults = async (electionId) => {
  const positions = await ElectionPosition.find({ electionId }).sort({ order: 1 }).lean();

  const resultsByPosition = await Promise.all(
    positions.map(async (pos) => {
      const candidates = await CandidateProfile.find({
        electionId,
        positionId: pos._id,
        $or: [{ approvalStatus: "approved" }, { isApproved: true }],
      })
        .populate("candidateId", "name email regNo department year photoUrl")
        .populate("studentId", "name email regNo department year photoUrl")
        .lean();

      let totalPositionVotes = 0;
      const candidateTallies = await Promise.all(
        candidates.map(async (cand) => {
          const studentObj = cand.studentId || cand.candidateId || {};
          const candidateUserId = cand.candidateId?._id || cand.studentId?._id;
          const validIds = [cand._id];
          if (candidateUserId) validIds.push(candidateUserId);

          const voteCount = await Vote.countDocuments({
            electionId,
            positionId: pos._id,
            candidateId: { $in: validIds },
          });

          totalPositionVotes += voteCount;

          return {
            profileId: cand._id,
            candidateId: candidateUserId,
            name: studentObj.name || "Candidate",
            regNo: studentObj.regNo || "",
            department: studentObj.department || "",
            year: studentObj.year || "",
            symbol: cand.assignedSymbol,
            photoUrl: cand.photoUrl || studentObj.photoUrl || "",
            votes: voteCount,
            voteCount,
          };
        })
      );

      // Sort descending by votes
      candidateTallies.sort((a, b) => b.votes - a.votes);

      // Zero votes & tie handling
      const topVotes = candidateTallies.length > 0 ? candidateTallies[0].votes : 0;
      const isTopTie =
        topVotes > 0 &&
        candidateTallies.filter((c) => c.votes === topVotes).length > 1;

      const rankedCandidates = candidateTallies.map((cand, idx) => {
        const pct =
          totalPositionVotes > 0
            ? Number(((cand.votes / totalPositionVotes) * 100).toFixed(2))
            : 0;

        const isWinner = topVotes > 0 && !isTopTie && cand.votes === topVotes;
        const isTiedWinner = topVotes > 0 && isTopTie && cand.votes === topVotes;

        return {
          ...cand,
          rank: idx + 1,
          percentage: pct,
          winner: isWinner,
          isTie: isTiedWinner,
          resultStatus: isWinner ? "WINNER" : isTiedWinner ? "TIE" : "NOT_WINNER",
        };
      });

      // No arbitrary winner if 0 votes or if there is a tie
      const winner =
        topVotes > 0 && !isTopTie && rankedCandidates.length > 0
          ? rankedCandidates[0]
          : null;

      return {
        positionId: pos._id,
        positionTitle: pos.title,
        totalVotes: totalPositionVotes,
        candidates: rankedCandidates,
        winner,
        isTie: isTopTie,
      };
    })
  );

  return resultsByPosition;
};

// @desc Get Election Results (Public / Student / Candidate)
// @route GET /api/results/:electionId
// @access Public / Authenticated
const getElectionResults = async (req, res, next) => {
  try {
    const { electionId } = req.params;
    const userRole = req.user?.role;

    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found.",
      });
    }

    const isPublished = Boolean(election.resultPublished || election.isResultsPublished);
    const isPrivileged = userRole === ROLES.ADMIN || userRole === ROLES.SUPERVISOR;

    // CRITICAL SECURITY ENFORCEMENT:
    // Before publishing, vote counts MUST NOT be returned to students/candidates/public
    if (!isPublished && !isPrivileged) {
      return res.status(403).json({
        success: false,
        published: false,
        message: "Election results have not been published yet.",
      });
    }

    const resultsByPosition = await computeElectionResults(electionId);

    return res.status(200).json({
      success: true,
      published: isPublished,
      data: {
        election: {
          _id: election._id,
          title: election.title,
          status: election.status,
          resultPublished: isPublished,
          isResultsPublished: isPublished,
          resultPublishedAt: election.resultPublishedAt || election.publishedAt,
          publishedAt: election.resultPublishedAt || election.publishedAt,
          startDate: election.startDate,
          endDate: election.endDate,
        },
        positions: resultsByPosition,
        results: resultsByPosition,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc Admin Preview Election Results (Before Publication)
// @route GET /api/results/:electionId/preview
// @access Private (Admin Only)
const previewElectionResults = async (req, res, next) => {
  try {
    const { electionId } = req.params;

    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found.",
      });
    }

    const resultsByPosition = await computeElectionResults(electionId);

    return res.status(200).json({
      success: true,
      preview: true,
      published: Boolean(election.resultPublished || election.isResultsPublished),
      data: {
        election: {
          _id: election._id,
          title: election.title,
          status: election.status,
          resultPublished: Boolean(election.resultPublished || election.isResultsPublished),
          isResultsPublished: Boolean(election.resultPublished || election.isResultsPublished),
          resultPublishedAt: election.resultPublishedAt || election.publishedAt,
          startDate: election.startDate,
          endDate: election.endDate,
        },
        positions: resultsByPosition,
        results: resultsByPosition,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc Admin Publish Election Results
// @route PUT /api/results/:electionId/publish
// @access Private (Admin Only)
const publishElectionResult = async (req, res, next) => {
  try {
    const { electionId } = req.params;

    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found.",
      });
    }

    const now = new Date();
    election.resultPublished = true;
    election.isResultsPublished = true;
    election.resultPublishedAt = now;
    election.publishedAt = now;
    election.resultPublishedBy = req.user._id;
    await election.save();

    await logAudit(req, "ELECTION_RESULTS_PUBLISHED", "Election", election._id, {
      electionTitle: election.title,
      publishedBy: req.user._id,
    });

    const resultsByPosition = await computeElectionResults(electionId);

    return res.status(200).json({
      success: true,
      message: "Election results published successfully.",
      published: true,
      data: {
        election: {
          _id: election._id,
          title: election.title,
          status: election.status,
          resultPublished: true,
          isResultsPublished: true,
          resultPublishedAt: now,
          publishedAt: now,
        },
        positions: resultsByPosition,
        results: resultsByPosition,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc Get Candidate's Own Result
// @route GET /api/results/:electionId/candidate-result
// @access Private (Candidate)
const getCandidateResult = async (req, res, next) => {
  try {
    const { electionId } = req.params;
    const userId = req.user._id;

    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: "Election not found.",
      });
    }

    const isPublished = Boolean(election.resultPublished || election.isResultsPublished);

    // Find candidate record
    const candidateProfile = await CandidateProfile.findOne({
      electionId,
      $or: [{ candidateId: userId }, { studentId: userId }],
    })
      .populate("candidateId", "name regNo department")
      .populate("studentId", "name regNo department")
      .populate("positionId", "title")
      .lean();

    if (!candidateProfile) {
      return res.status(404).json({
        success: false,
        message: "No candidate profile found for this user in this election.",
      });
    }

    // STRICT CHECK: Before publication, hide vote count
    if (!isPublished) {
      return res.status(200).json({
        success: false,
        published: false,
        message: "Election results have not been published yet.",
        data: {
          candidateId: candidateProfile._id,
          candidateName: candidateProfile.studentId?.name || candidateProfile.candidateId?.name,
          position: candidateProfile.positionId?.title,
          status: candidateProfile.approvalStatus,
          resultPublished: false,
        },
      });
    }

    // After publication, compute exact results
    const resultsByPosition = await computeElectionResults(electionId);
    const positionResult = resultsByPosition.find(
      (p) => p.positionId.toString() === candidateProfile.positionId?._id.toString()
    );

    const candUserId = candidateProfile.candidateId?._id || candidateProfile.studentId?._id;
    const candidateTally = positionResult?.candidates?.find(
      (c) =>
        c.profileId?.toString() === candidateProfile._id.toString() ||
        c.candidateId?.toString() === candUserId?.toString()
    );

    const studentObj = candidateProfile.studentId || candidateProfile.candidateId || {};

    return res.status(200).json({
      success: true,
      published: true,
      data: {
        candidateId: candidateProfile._id,
        candidateName: studentObj.name || "Candidate",
        position: candidateProfile.positionId?.title || "Position",
        voteCount: candidateTally?.votes ?? 0,
        percentage: candidateTally?.percentage ?? 0,
        winner: Boolean(candidateTally?.winner),
        isTie: Boolean(candidateTally?.isTie),
        resultStatus: candidateTally?.resultStatus || (candidateTally?.winner ? "WINNER" : "NOT_WINNER"),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getElectionResults,
  previewElectionResults,
  publishElectionResult,
  getCandidateResult,
};
