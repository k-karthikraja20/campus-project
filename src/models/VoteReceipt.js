const mongoose = require("mongoose");
const crypto = require("crypto");

const voteReceiptSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Student ID is required"],
      index: true,
    },
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
    receiptId: {
      type: String,
      unique: true,
      default: () => "RCPT-" + crypto.randomBytes(8).toString("hex").toUpperCase(),
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Enforce one vote per student per election and position
voteReceiptSchema.index(
  { studentId: 1, electionId: 1, positionId: 1 },
  { unique: true }
);

module.exports = mongoose.models.VoteReceipt || mongoose.model("VoteReceipt", voteReceiptSchema);
