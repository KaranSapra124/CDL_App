import { useState } from "react";
import { apiFetch } from "../lib/api";
import { toast } from "../lib/toast";
import { CATEGORY_META, INTEREST_OPTIONS } from "../lib/status";

export default function AddLeadModal({ managers = [], isAdmin = false, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    mobile: "",
    city: "",
    state: "",
    groupJoined: "",
    interestCategory: "",
    interest: "",
    remarks: "",
  });
  const [owner, setOwner] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleCategory = (cat) =>
    setForm((f) => ({
      ...f,
      interestCategory: cat,
      interest: INTEREST_OPTIONS[cat]?.includes(f.interest) ? f.interest : "",
    }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/leads", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          interestCategory: form.interestCategory || null,
          interest: form.interest || null,
          ...(isAdmin && owner ? { assignedTo: owner } : {}),
        }),
      });
      toast(
        isAdmin && owner
          ? `Lead created and assigned to ${res.data.assignedTo?.name || "manager"}`
          : isAdmin
            ? "Lead created"
            : "Lead created and added under you"
      );
      onCreated(res.data);
    } catch (err) {
      setError(err.message || "Failed to create lead");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-line bg-white px-2.5 py-2 text-[13px] focus:border-primary focus:outline-none";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[rgba(20,10,50,0.35)]" onClick={onClose} />
      <div
        className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4"
        onClick={onClose}
      >
        <form
          onClick={(e) => e.stopPropagation()}
          onSubmit={submit}
          className="w-full max-w-[460px] rounded-2xl bg-white p-5 shadow-[0_12px_40px_rgba(20,10,50,0.18)]"
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold">Add new lead</h3>
              <p className="mt-0.5 text-xs text-mut">
                {isAdmin
                  ? "Optionally assign an owner right away."
                  : "This lead will be added under you automatically."}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-[#faf7ff]"
            >
              Close
            </button>
          </div>

          <div className="mt-4 grid gap-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-[11.5px] font-medium text-mut">
                  Name *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11.5px] font-medium text-mut">
                  Mobile *
                </label>
                <input
                  type="text"
                  required
                  value={form.mobile}
                  onChange={(e) => setField("mobile", e.target.value)}
                  placeholder="10-digit number"
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
                  type="email"
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
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-[11.5px] font-medium text-mut">
                  Interest category
                </label>
                <select
                  value={form.interestCategory}
                  onChange={(e) => handleCategory(e.target.value)}
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

            {isAdmin && (
              <div>
                <label className="mb-1 block text-[11.5px] font-medium text-mut">
                  Assign to (optional)
                </label>
                <select
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Leave unassigned</option>
                  {managers.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name}
                      {m.staffCode ? ` (${m.staffCode})` : ""}
                    </option>
                  ))}
                </select>
              </div>
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

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create lead"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
