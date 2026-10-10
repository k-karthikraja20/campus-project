const mongoose = require("mongoose");
const { ELECTION_STATUS } = require("../config/constants");

const electionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Election title is required"],
      trim: true,
      maxlength: 150,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
    },
    status: {
      type: String,
      enum: Object.values(ELECTION_STATUS),
      default: ELECTION_STATUS.DRAFT,
      index: true,
    },
    isSelfVotingAllowed: {
      type: Boolean,
      default: false,
    },
    isResultsPublished: {
      type: Boolean,
      default: false,
    },
    publishedAt: {
      type: Date,
    },
    resultPublished: {
      type: Boolean,
      default: false,
    },
    resultPublishedAt: {
      type: Date,
    },
    resultPublishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Synchronize resultPublished with isResultsPublished and dates
electionSchema.pre("save", function (next) {
  if (this.resultPublished || this.isResultsPublished) {
    this.resultPublished = true;
    this.isResultsPublished = true;
    if (!this.resultPublishedAt && !this.publishedAt) {
      const now = new Date();
      this.resultPublishedAt = now;
      this.publishedAt = now;
    } else {
      this.resultPublishedAt = this.resultPublishedAt || this.publishedAt;
      this.publishedAt = this.publishedAt || this.resultPublishedAt;
    }
  }
  next();
});

// Virtual to determine if election is currently open based on status and dates
electionSchema.methods.isVotingActive = function () {
  const now = new Date();
  return (
    this.status === ELECTION_STATUS.ACTIVE &&
    now >= new Date(this.startDate) &&
    now <= new Date(this.endDate)
  );
};

module.exports = mongoose.models.Election || mongoose.model("Election", electionSchema);
