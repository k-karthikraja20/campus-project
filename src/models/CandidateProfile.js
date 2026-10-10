const mongoose = require("mongoose");

const candidateProfileSchema = new mongoose.Schema(
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
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CandidateApplication",
    },
    assignedSymbol: {
      name: { type: String, trim: true, default: "Pending Assignment" },
      code: { type: String, trim: true, uppercase: true, default: "PENDING" },
      icon: { type: String, default: "🗳️" },
      description: { type: String, default: "" },
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
    photoUrl: {
      type: String,
      default: "",
    },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    adminApproval: {
      status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
      },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      approvedAt: {
        type: Date,
        default: null,
      },
    },
    supervisorApproval: {
      status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
      },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      approvedAt: {
        type: Date,
        default: null,
      },
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to synchronize studentId, candidateId, two-level approval, and isApproved
candidateProfileSchema.pre("save", function (next) {
  if (this.candidateId && !this.studentId) {
    this.studentId = this.candidateId;
  }
  if (this.studentId && !this.candidateId) {
    this.candidateId = this.studentId;
  }

  // Two-level approval resolution:
  // If either admin or supervisor rejected -> overall rejected
  if (
    this.adminApproval?.status === "rejected" ||
    this.supervisorApproval?.status === "rejected"
  ) {
    this.approvalStatus = "rejected";
    this.isApproved = false;
  } else if (
    this.adminApproval?.status === "approved" &&
    this.supervisorApproval?.status === "approved"
  ) {
    this.approvalStatus = "approved";
    this.isApproved = true;
    if (!this.approvedAt) this.approvedAt = new Date();
  } else if (
    this.approvalStatus === "approved" &&
    (this.adminApproval?.status !== "approved" || this.supervisorApproval?.status !== "approved")
  ) {
    // Legacy / direct approval override (e.g. directNominate or single-endpoint legacy tests)
    this.adminApproval = this.adminApproval || {};
    this.supervisorApproval = this.supervisorApproval || {};
    this.adminApproval.status = "approved";
    this.adminApproval.approvedBy = this.approvedBy || null;
    this.adminApproval.approvedAt = this.approvedAt || new Date();
    this.supervisorApproval.status = "approved";
    this.supervisorApproval.approvedBy = this.approvedBy || null;
    this.supervisorApproval.approvedAt = this.approvedAt || new Date();
    this.isApproved = true;
  } else if (this.approvalStatus === "rejected") {
    this.isApproved = false;
  } else {
    this.approvalStatus = "pending";
    this.isApproved = false;
  }

  next();
});

// Prevent duplicate candidate nomination for same election & position
candidateProfileSchema.index(
  { electionId: 1, positionId: 1, candidateId: 1 },
  { unique: true }
);

// Fast lookups for candidate queries by election and approvalStatus
candidateProfileSchema.index({ electionId: 1, approvalStatus: 1 });
candidateProfileSchema.index({ electionId: 1, positionId: 1, approvalStatus: 1 });

// Enforce symbol uniqueness per election and position for approved candidates
candidateProfileSchema.index(
  { electionId: 1, positionId: 1, "assignedSymbol.code": 1 },
  {
    unique: true,
    partialFilterExpression: {
      approvalStatus: "approved",
      "assignedSymbol.code": { $ne: "PENDING" },
    },
  }
);

module.exports = mongoose.models.CandidateProfile || mongoose.model("CandidateProfile", candidateProfileSchema);

