const express = require("express");
const router = express.Router();
const {
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
} = require("../controllers/candidateController");
const { verifyToken, authorizeRoles } = require("../middleware/auth");
const { ROLES } = require("../config/constants");

// Application status for logged-in student/candidate
router.get("/status", verifyToken, getCandidateApplicationStatus);
router.get("/application-status", verifyToken, getCandidateApplicationStatus);

// Public candidate listing (ONLY approved candidates returned)
router.get("/", getCandidates);

// Admin pending candidates (ONLY pending candidates returned)
router.get(
  "/pending",
  verifyToken,
  authorizeRoles(ROLES.ADMIN, ROLES.SUPERVISOR),
  getPendingCandidates
);

// Student nomination application
router.post(
  "/",
  verifyToken,
  applyCandidate
);

// Two-Level Approval: Admin Specific
router.put(
  "/:id/admin-approve",
  verifyToken,
  authorizeRoles(ROLES.ADMIN),
  adminApproveCandidate
);

router.put(
  "/:id/admin-reject",
  verifyToken,
  authorizeRoles(ROLES.ADMIN),
  adminRejectCandidate
);

// Two-Level Approval: Supervisor Specific
router.put(
  "/:id/supervisor-approve",
  verifyToken,
  authorizeRoles(ROLES.SUPERVISOR),
  supervisorApproveCandidate
);

router.put(
  "/:id/supervisor-reject",
  verifyToken,
  authorizeRoles(ROLES.SUPERVISOR),
  supervisorRejectCandidate
);

// Admin / Supervisor Approval & Rejection (Unified legacy)
router.put(
  "/:id/approve",
  verifyToken,
  authorizeRoles(ROLES.ADMIN, ROLES.SUPERVISOR),
  approveCandidate
);

router.put(
  "/:id/reject",
  verifyToken,
  authorizeRoles(ROLES.ADMIN, ROLES.SUPERVISOR),
  rejectCandidate
);

// Candidate own profile
router.get("/me", verifyToken, getMyCandidateProfile);
router.put("/profile", verifyToken, authorizeRoles(ROLES.CANDIDATE), updateMyProfile);

// Admin & Supervisor direct nomination & deletion
router.post(
  "/nominate",
  verifyToken,
  authorizeRoles(ROLES.ADMIN, ROLES.SUPERVISOR),
  directNominate
);

router.delete(
  "/:id",
  verifyToken,
  authorizeRoles(ROLES.ADMIN, ROLES.SUPERVISOR),
  deleteCandidate
);

module.exports = router;
