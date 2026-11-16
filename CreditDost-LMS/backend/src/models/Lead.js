import mongoose from "mongoose";

const leadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Lead name is required"],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    source: {
      type: String,
      trim: true,
      default: "web",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    interestCategory: {
      type: String,
      enum: ["Interested In", "Follow Up"],
      default: null,
    },
    interest: {
      type: String,
      enum: ["Franchise", "Credit Score Repair", "Call Back"],
      default: null,
    },
    status: {
      type: String,
      enum: [
        "Not Contacted",
        "Not Interested",
        "Work In Progress",
        "Closed",
        "Sale Closed",
      ],
      default: "Work In Progress",
    },
    nextFollowUp: {
      type: Date,
      default: null,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

leadSchema.index({ phone: 1 }, { unique: true });

const Lead = mongoose.model("Lead", leadSchema);

export default Lead;
