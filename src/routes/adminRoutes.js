const express = require("express");
const router = express.Router();
const {
  getDashboardStats,
  getAuditLogs,
  getStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  getSupervisors,
  createSupervisor,
  updateSupervisor,
  deleteSupervisor,
  createCandidateAccount,
} = require("../controllers/adminController");
const { verifyToken, authorizeRoles } = require("../middleware/auth");
const { ROLES } = require("../config/constants");

// Protect all admin routes
router.use(verifyToken);
router.use(authorizeRoles(ROLES.ADMIN));

router.get("/dashboard", getDashboardStats);
router.get("/audit-logs", getAuditLogs);

// Student management
router.get("/students", getStudents);
router.post("/students", createStudent);
router.put("/students/:id", updateStudent);
router.delete("/students/:id", deleteStudent);

// Supervisor management
router.get("/supervisors", getSupervisors);
router.post("/supervisors", createSupervisor);
router.put("/supervisors/:id", updateSupervisor);
router.delete("/supervisors/:id", deleteSupervisor);

// Candidate account creation
router.post("/candidates", createCandidateAccount);

module.exports = router;
