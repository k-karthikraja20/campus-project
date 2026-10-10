const express = require("express");
const router = express.Router();
const {
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
} = require("../controllers/electionController");
const { verifyToken, authorizeRoles } = require("../middleware/auth");
const { ROLES } = require("../config/constants");

// Public/optional auth for viewing
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return verifyToken(req, res, next);
  }
  next();
};

router.get("/active", optionalAuth, getActiveElections);
router.get("/", optionalAuth, getElections);
router.get("/:electionId/positions", optionalAuth, getPositionsByElection);
router.get("/:id/positions", optionalAuth, getPositionsByElection);
router.get("/:id", optionalAuth, getElectionById);

// Admin only routes
router.post("/", verifyToken, authorizeRoles(ROLES.ADMIN), createElection);
router.put("/:id", verifyToken, authorizeRoles(ROLES.ADMIN), updateElection);
router.delete("/:id", verifyToken, authorizeRoles(ROLES.ADMIN), deleteElection);
router.post("/:id/publish-results", verifyToken, authorizeRoles(ROLES.ADMIN), publishResults);

// Status change (Admin & Supervisor)
router.patch("/:id/status", verifyToken, authorizeRoles(ROLES.ADMIN, ROLES.SUPERVISOR), changeStatus);

// Position management (Admin only)
router.post("/:id/positions", verifyToken, authorizeRoles(ROLES.ADMIN), addPosition);
router.put("/:id/positions/:positionId", verifyToken, authorizeRoles(ROLES.ADMIN), updatePosition);
router.delete("/:id/positions/:positionId", verifyToken, authorizeRoles(ROLES.ADMIN), deletePosition);

module.exports = router;
