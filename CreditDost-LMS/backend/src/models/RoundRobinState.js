import mongoose from "mongoose";

const roundRobinStateSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
    },
    lastStaffIndex: {
      type: Number,
      default: -1,
    },
  },
  { timestamps: true }
);

export default mongoose.model("RoundRobinState", roundRobinStateSchema);
