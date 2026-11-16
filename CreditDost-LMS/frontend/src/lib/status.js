export const CATEGORY_META = {
  "Interested In": { label: "Interested In", cls: "bg-violet-50 text-violet-700" },
  "Follow Up": { label: "Follow Up", cls: "bg-amber-50 text-amber-700" },
};

export const INTEREST_OPTIONS = {
  "Interested In": ["Franchise", "Credit Score Repair"],
  "Follow Up": ["Call Back"],
};

export const STATUS_META = {
  "Not Contacted": { label: "Not Contacted", cls: "bg-rose-50 text-rose-700" },
  "Not Interested": { label: "Not Interested", cls: "bg-red-50 text-red-700" },
  "Work In Progress": { label: "Work In Progress", cls: "bg-blue-50 text-blue-700" },
  Closed: { label: "Closed", cls: "bg-emerald-50 text-emerald-700" },
  "Sale Closed": { label: "Sale Closed", cls: "bg-teal-50 text-teal-700" },
};

export const statusMeta = (status) =>
  STATUS_META[status] || { label: status || "—", cls: "bg-slate-100 text-slate-600" };

export const categoryMeta = (category) =>
  CATEGORY_META[category] || { label: category || "—", cls: "bg-slate-100 text-slate-600" };
