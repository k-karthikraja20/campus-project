const mongoose = require("mongoose");
const crypto = require("crypto");

const voteSchema = new mongoose.Schema(
  {
    electionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Election",
      required: [true, "Election ID is required"],
      index: true,
    },
    positionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ElectionPosition",
      required: [true, "Position ID is required"],
      index: true,
    },
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Candidate ID is required"],
      index: true,
    },
    ballotHash: {
      type: String,
      unique: true,
      default: () => crypto.randomBytes(16).toString("hex"),
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Helpful index for fast tallying
voteSchema.index({ electionId: 1, positionId: 1, candidateId: 1 });

module.exports = mongoose.models.Vote || mongoose.model("Vote", voteSchema);
