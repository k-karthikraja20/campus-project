const express = require("express");
const router = express.Router();
const {
  submitApplication,
  getApplications,
  reviewApplication,
  getSupportedSymbols,
} = require("../controllers/candidateApplicationController");
const { verifyToken, authorizeRoles } = require("../middleware/auth");
const { ROLES } = require("../config/constants");

// Public/authenticated: get supported symbols
router.get("/supported-symbols", getSupportedSymbols);

// Protected routes
router.use(verifyToken);

router.post("/", submitApplication);
router.get("/", getApplications);

// Review (Admin & Supervisor)
router.put(
  "/:id/review",
  authorizeRoles(ROLES.ADMIN, ROLES.SUPERVISOR),
  reviewApplication
);

module.exports = router;
