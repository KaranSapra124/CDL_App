import SheetLead from "../models/SheetLead.js";
import User from "../models/User.js";
import RoundRobinState from "../models/RoundRobinState.js";

const STATE_KEY = "sheet_lead_round_robin";

export const RM_POOL_FILTER = {
  subRole: "relationship_manager",
  staffCode: { $exists: true, $ne: "", $regex: /^RM/i },
  isActive: true,
  isDeleted: false,
};

export const getRoundRobinStaff = async (excludeStaffIds = []) => {
  const staff = await User.find({
    ...RM_POOL_FILTER,
    ...(excludeStaffIds.length ? { _id: { $nin: excludeStaffIds } } : {}),
  })
    .select("_id name staffCode")
    .lean();

  return staff.sort((a, b) =>
    (a.staffCode || "").localeCompare(b.staffCode || "") ||
    a.name.localeCompare(b.name)
  );
};

// @desc   Assign leads to staff in serial round-robin order
//         (lead 1 -> staff[0], lead 2 -> staff[1], ... wrapping around)
export const assignLeadsRoundRobin = async (leadIds, { excludeStaffIds = [] } = {}) => {
  if (!leadIds?.length) {
    return { assignments: new Map(), skipped: 0 };
  }

  const staff = await getRoundRobinStaff(excludeStaffIds);
  if (!staff.length) {
    return { assignments: new Map(), skipped: leadIds.length };
  }

  const state = await RoundRobinState.findOneAndUpdate(
    { key: STATE_KEY },
    { $setOnInsert: { lastStaffIndex: -1 } },
    { new: true, upsert: true }
  );

  const assignments = new Map();
  let idx = state.lastStaffIndex;
  for (const leadId of leadIds) {
    idx = (idx + 1) % staff.length;
    assignments.set(String(leadId), staff[idx]._id);
  }

  const assignedAt = new Date();
  await SheetLead.bulkWrite(
    [...assignments].map(([leadId, staffId]) => ({
      updateOne: {
        filter: { _id: leadId },
        update: { $set: { assignedTo: staffId, assignedAt } },
      },
    }))
  );

  await RoundRobinState.updateOne(
    { key: STATE_KEY },
    { $set: { lastStaffIndex: idx } }
  );

  return { assignments, skipped: 0 };
};
