const express = require("express");
const router = express.Router();
const {
  getElectionResults,
  previewElectionResults,
  publishElectionResult,
  getCandidateResult,
} = require("../controllers/resultController");
const { verifyToken, authorizeRoles } = require("../middleware/auth");
const { ROLES } = require("../config/constants");

// Optional auth so if a student/candidate/supervisor/admin provides token, their identity is recognized
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return verifyToken(req, res, next);
  }
  next();
};

// Admin only: Preview results prior to official publication
router.get(
  "/:electionId/preview",
  verifyToken,
  authorizeRoles(ROLES.ADMIN),
  previewElectionResults
);

// Admin only: Publish official results
router.put(
  "/:electionId/publish",
  verifyToken,
  authorizeRoles(ROLES.ADMIN),
  publishElectionResult
);

// Candidate only: Get candidate-specific result card data
router.get(
  "/:electionId/candidate-result",
  verifyToken,
  getCandidateResult
);

// Public / Student / Voter result retrieval
router.get("/:electionId", optionalAuth, getElectionResults);

module.exports = router;
