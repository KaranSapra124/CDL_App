import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { statusMeta, categoryMeta, STATUS_META, CATEGORY_META, INTEREST_OPTIONS } from "../lib/status";
import { timeAgo, initials, toDateTimeInput, formatDateTime } from "../lib/format";
import { toast } from "../lib/toast";

export default function LeadDrawer({ lead, managers, isAdmin = false, onClose, onUpdated }) {
  const [manager, setManager] = useState("");
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (lead) {
      setManager(lead.assignedTo?._id || "");
      setForm({
        name: lead.name || "",
        email: lead.email || "",
        mobile: lead.mobile || "",
        city: lead.city || "",
        state: lead.state || "",
        groupJoined: lead.groupJoined || "",
        interestCategory: lead.interestCategory || "",
        interest: lead.interest || "",
        status: lead.status || "New Lead",
        nextFollowUp: toDateTimeInput(lead.nextFollowUp),
        remarks: lead.remarks || "",
      });
    }
  }, [lead]);

  if (!lead || !form) return null;

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleCategoryChange = (cat) => {
    setForm((f) => ({
      ...f,
      interestCategory: cat,
      interest: INTEREST_OPTIONS[cat]?.includes(f.interest) ? f.interest : "",
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = isAdmin
        ? {
            name: form.name,
            email: form.email,
            mobile: form.mobile,
            city: form.city,
            state: form.state,
            groupJoined: form.groupJoined,
            interestCategory: form.interestCategory || null,
            interest: form.interest || null,
            status: form.status,
            nextFollowUp: form.nextFollowUp
              ? new Date(form.nextFollowUp).toISOString()
              : null,
            remarks: form.remarks,
          }
        : {
            interestCategory: form.interestCategory || null,
            interest: form.interest || null,
            status: form.status,
            nextFollowUp: form.nextFollowUp
              ? new Date(form.nextFollowUp).toISOString()
              : null,
            remarks: form.remarks,
          };

      const res = await apiFetch(`/leads/${lead._id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });

      toast("Lead updated");
      onUpdated(res.data);
    } catch (err) {
      toast(err.message || "Failed to update lead");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-line bg-white px-2.5 py-2 text-[13px] focus:border-primary focus:outline-none";

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
    ["Mobile", lead.mobile],
    [
      "WhatsApp",
      lead.whatsappNumber
        ? /^\d{6,}$/.test(lead.whatsappNumber)
          ? `+91 ${lead.whatsappNumber}`
          : lead.whatsappNumber
        : "—",
    ],
    ["Email", lead.email || "—"],
    ["Source", lead.source || "—"],
    ["City", lead.city || "—"],
    ["State", lead.state || "—"],
    ["Next call", lead.nextFollowUp ? formatDateTime(lead.nextFollowUp) : "—"],
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

        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${categoryMeta(lead.interestCategory).cls}`}>
            {categoryMeta(lead.interestCategory).label}
          </span>
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

        {lead.interest && (
          <div className="mt-4">
            <h4 className="mb-2 text-[13px] font-semibold">Interest</h4>
            <p className="rounded-lg bg-[#faf9fd] px-3 py-2.5 text-[13px] text-[#3a3950]">
              {lead.interestCategory} — {lead.interest}
            </p>
          </div>
        )}

        <div className="mt-4 rounded-lg bg-[#fff0d4] px-3 py-2.5 text-xs text-[#9a5b00]">
          {isAdmin
            ? "Every lead has exactly one owner. Only an admin can change it."
            : `Owner locked. This lead stays with ${lead.assignedTo?.name || "its owner"} unless an admin reassigns it.`}
        </div>

        <div className="mt-4 border-t border-line pt-4">
          <h4 className="mb-2.5 text-[13px] font-semibold">Edit lead</h4>
          <div className="grid gap-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-[11.5px] font-medium text-mut">
                  Interest category
                </label>
                <select
                  value={form.interestCategory}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Not set</option>
                  {Object.entries(CATEGORY_META).map(([key, m]) => (
                    <option key={key} value={key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11.5px] font-medium text-mut">
                  Interest
                </label>
                <select
                  value={form.interest}
                  onChange={(e) => setField("interest", e.target.value)}
                  disabled={!form.interestCategory}
                  className={`${inputCls} disabled:cursor-not-allowed disabled:bg-page disabled:text-mut`}
                >
                  <option value="">Not set</option>
                  {(INTEREST_OPTIONS[form.interestCategory] || []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-mut">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => setField("status", e.target.value)}
                className={inputCls}
              >
                {Object.entries(STATUS_META).map(([key, m]) => (
                  <option key={key} value={key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-mut">
                Next follow up date
              </label>
              <input
                type="datetime-local"
                value={form.nextFollowUp}
                onChange={(e) => setField("nextFollowUp", e.target.value)}
                className={inputCls}
              />
            </div>

            {isAdmin && (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="mb-1 block text-[11.5px] font-medium text-mut">
                      Name
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setField("name", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11.5px] font-medium text-mut">
                      Mobile
                    </label>
                    <input
                      type="text"
                      value={form.mobile}
                      onChange={(e) => setField("mobile", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="mb-1 block text-[11.5px] font-medium text-mut">
                      Email
                    </label>
                    <input
                      type="text"
                      value={form.email}
                      onChange={(e) => setField("email", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11.5px] font-medium text-mut">
                      Group joined
                    </label>
                    <input
                      type="text"
                      value={form.groupJoined}
                      onChange={(e) => setField("groupJoined", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="mb-1 block text-[11.5px] font-medium text-mut">
                      City
                    </label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => setField("city", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11.5px] font-medium text-mut">
                      State
                    </label>
                    <input
                      type="text"
                      value={form.state}
                      onChange={(e) => setField("state", e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-mut">
                Remarks
              </label>
              <textarea
                rows="3"
                value={form.remarks}
                onChange={(e) => setField("remarks", e.target.value)}
                placeholder="Add a note about this lead..."
                className={`${inputCls} resize-none`}
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
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
