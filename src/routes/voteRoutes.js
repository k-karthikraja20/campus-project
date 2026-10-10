const express = require("express");
const router = express.Router();
const {
  submitVote,
  getMyReceipts,
  getElectionTurnout,
} = require("../controllers/voteController");
const { verifyToken, authorizeRoles } = require("../middleware/auth");
const { ROLES } = require("../config/constants");

router.use(verifyToken);

// Student/Candidate casts a ballot
router.post("/", submitVote);

// Student gets personal vote receipts
router.get("/my-receipts", getMyReceipts);

// Turnout monitoring for Admin & Supervisor
router.get(
  "/turnout/:electionId",
  authorizeRoles(ROLES.ADMIN, ROLES.SUPERVISOR),
  getElectionTurnout
);

module.exports = router;
