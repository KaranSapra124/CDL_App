import mongoose from "mongoose";

const sheetLeadSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      default: null,
    },
    source: {
      type: String,
      trim: true,
      default: "",
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    mobile: {
      type: String,
      required: [true, "Mobile is required"],
      trim: true,
    },
    whatsappNumber: {
      type: String,
      trim: true,
      default: "",
    },
    city: {
      type: String,
      trim: true,
      default: "",
    },
    state: {
      type: String,
      trim: true,
      default: "",
    },
    groupJoined: {
      type: String,
      trim: true,
      default: "",
    },
    remarks: {
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
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedAt: {
      type: Date,
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
  },
  { timestamps: true }
);

sheetLeadSchema.index({ mobile: 1 }, { unique: true });

const SheetLead = mongoose.model("SheetLead", sheetLeadSchema);

export default SheetLead;
