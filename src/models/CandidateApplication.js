const mongoose = require("mongoose");
const { APPLICATION_STATUS } = require("../config/constants");

const candidateApplicationSchema = new mongoose.Schema(
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
    manifesto: {
      type: String,
      trim: true,
      default: "",
    },
    plannedWork: {
      type: [String],
      default: [],
    },
    preferredSymbol: {
      type: String,
      trim: true,
      default: "",
    },
    assignedSymbol: {
      name: { type: String, trim: true },
      code: { type: String, trim: true },
      icon: { type: String, trim: true },
    },
    status: {
      type: String,
      enum: Object.values(APPLICATION_STATUS),
      default: APPLICATION_STATUS.PENDING,
      index: true,
    },
    reviewComment: {
      type: String,
      trim: true,
      default: "",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate nomination applications for the same candidate, election and position
candidateApplicationSchema.index(
  { electionId: 1, positionId: 1, candidateId: 1 },
  { unique: true }
);

module.exports = mongoose.models.CandidateApplication || mongoose.model("CandidateApplication", candidateApplicationSchema);
