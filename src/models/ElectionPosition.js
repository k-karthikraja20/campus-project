const mongoose = require("mongoose");

const electionPositionSchema = new mongoose.Schema(
  {
    electionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Election",
      required: [true, "Election ID is required"],
      index: true,
    },
    title: {
      type: String,
      required: [true, "Position title is required"],
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    minAcademicPercentage: {
      type: Number,
      required: [true, "Minimum academic percentage is required"],
      min: 0,
      max: 100,
      default: 70,
    },
    maxVotesAllowedPerVoter: {
      type: Number,
      default: 1,
      min: 1,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

electionPositionSchema.index({ electionId: 1, title: 1 }, { unique: true });

module.exports = mongoose.models.ElectionPosition || mongoose.model("ElectionPosition", electionPositionSchema);
