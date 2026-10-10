const express = require("express");
const router = express.Router();
const {
  getSupervisorDashboard,
  getVoteMonitoringLogs,
} = require("../controllers/supervisorController");
const { verifyToken, authorizeRoles } = require("../middleware/auth");
const { ROLES } = require("../config/constants");

router.use(verifyToken);
router.use(authorizeRoles(ROLES.SUPERVISOR, ROLES.ADMIN));

router.get("/dashboard", getSupervisorDashboard);
router.get("/vote-monitoring", getVoteMonitoringLogs);

module.exports = router;
