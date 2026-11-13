import { useState } from "react";
import { apiFetch } from "../lib/api";
import { statusMeta } from "../lib/status";
import { timeAgo, initials } from "../lib/format";
import { toast } from "../lib/toast";

export default function LeadDrawer({ lead, managers, isAdmin = false, onClose, onUpdated }) {
  const [manager, setManager] = useState(lead?.assignedTo?._id || "");
  const [saving, setSaving] = useState(false);

  if (!lead) return null;

  const handleAssign = async () => {
    if (!manager) {
      toast("Select a business manager first");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`/leads/${lead._id}/assign`, {
        method: "PUT",
        body: JSON.stringify({ assignedTo: manager }),
      });
      toast(`Lead assigned to ${res.data.assignedTo?.name || "manager"}`);
      onUpdated(res.data);
      onClose();
    } catch (err) {
      toast(err.message || "Failed to assign lead");
    } finally {
      setSaving(false);
    }
  };

  const rows = [
    ["Phone", lead.phone],
    ["Email", lead.email || "—"],
    ["Source", lead.source || "—"],
    ["Created", new Date(lead.createdAt).toLocaleString("en-IN")],
    ["Last updated", new Date(lead.updatedAt).toLocaleString("en-IN")],
    [
      "Owner",
      lead.assignedTo ? (
        <span className="inline-flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-primary-soft text-[10.5px] font-bold text-primary">
            {initials(lead.assignedTo.name)}
          </span>
          {lead.assignedTo.name}
        </span>
      ) : (
        <span className="text-red-600">Not assigned</span>
      ),
    ],
  ];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[rgba(20,10,50,0.35)]" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[470px] overflow-y-auto bg-white p-5 shadow-[-8px_0_30px_rgba(0,0,0,0.12)]">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold">{lead.name}</h3>
            <div className="mt-0.5 text-xs text-mut">
              {lead._id}
              {lead.assignedTo?.staffCode ? ` · Owner: ${lead.assignedTo.staffCode}` : ""}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-[#faf7ff]"
          >
            Close
          </button>
        </div>

        <div className="mt-3">
          <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${statusMeta(lead.status).cls}`}>
            {statusMeta(lead.status).label}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-[110px_1fr] gap-x-2.5 gap-y-1.5 text-[13px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <span className="text-mut">{k}</span>
              <span className="font-medium">{v}</span>
            </div>
          ))}
        </div>

        {lead.notes && (
          <div className="mt-4">
            <h4 className="mb-2 text-[13px] font-semibold">Notes</h4>
            <p className="rounded-lg bg-[#faf9fd] px-3 py-2.5 text-[13px] text-[#3a3950]">{lead.notes}</p>
          </div>
        )}

        <div className="mt-4 rounded-lg bg-[#fff0d4] px-3 py-2.5 text-xs text-[#9a5b00]">
          {isAdmin
            ? "Every lead has exactly one owner. Only an admin can change it."
            : `Owner locked. This lead stays with ${lead.assignedTo?.name || "its owner"} unless an admin reassigns it.`}
        </div>

        {isAdmin && (
          <div className="mt-4 border-t border-line pt-4">
            <h4 className="mb-2.5 text-[13px] font-semibold">
              {lead.assignedTo ? "Reassign owner" : "Assign owner"}
            </h4>
            {managers.length ? (
              <div className="grid gap-2">
                <select
                  value={manager}
                  onChange={(e) => setManager(e.target.value)}
                  className="w-full rounded-lg border border-line bg-white px-2.5 py-2 text-[13px] focus:border-primary focus:outline-none"
                >
                  <option value="">Select a relationship manager</option>
                  {managers.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name}
                      {m.staffCode ? ` (${m.staffCode})` : ""}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAssign}
                  disabled={saving}
                  className="w-full rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
                >
                  {saving ? "Assigning..." : lead.assignedTo ? "Reassign" : "Assign"}
                </button>
              </div>
            ) : (
              <p className="text-[13px] text-mut">
                No active staff members found. Create accounts with a subRole first.
              </p>
            )}
          </div>
        )}

        <div className="mt-4 border-t border-line pt-4">
          <h4 className="mb-2.5 text-[13px] font-semibold">Timeline</h4>
          <div className="ml-1.5 border-l-2 border-line pl-3.5">
            <div className="relative mb-3 text-[13px]">
              <span className="absolute -left-[19px] top-1.5 h-2 w-2 rounded-full bg-primary" />
              Lead created
              <small className="block text-[11.5px] text-mut">{timeAgo(lead.createdAt)}</small>
            </div>
            {lead.assignedTo && (
              <div className="relative mb-3 text-[13px]">
                <span className="absolute -left-[19px] top-1.5 h-2 w-2 rounded-full bg-[#1fa971]" />
                Assigned to {lead.assignedTo.name}
                <small className="block text-[11.5px] text-mut">
                  {lead.assignedAt ? timeAgo(lead.assignedAt) : "recently"}
                </small>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
