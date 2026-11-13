export const STATUS_META = {
  new: { label: "New", cls: "bg-blue-50 text-blue-700" },
  assigned: { label: "Assigned", cls: "bg-violet-50 text-violet-700" },
  "in-progress": { label: "In Progress", cls: "bg-amber-50 text-amber-700" },
  converted: { label: "Converted", cls: "bg-emerald-50 text-emerald-700" },
  lost: { label: "Lost", cls: "bg-red-50 text-red-700" },
};

export const statusMeta = (status) =>
  STATUS_META[status] || { label: status, cls: "bg-slate-100 text-slate-600" };
