import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { statusMeta, categoryMeta } from "../lib/status";
import { initials, toDateTimeInput, formatDateTime } from "../lib/format";
import { toast } from "../lib/toast";
import LeadDrawer from "../components/LeadDrawer";
import { getAuth } from "../lib/auth";

const CLOSED_STATUSES = ["Closed", "Sale Closed", "Not Interested"];
const PAGE_SIZES = [10, 25, 50];

const dueAt = (lead) => new Date(lead.nextFollowUp).getTime();

const dueLabel = (lead, due, now) =>
  due <= now
    ? `Overdue · ${formatDateTime(lead.nextFollowUp)}`
    : `Due ${formatDateTime(lead.nextFollowUp)}`;

const dueCls = (due, now) => {
  const diff = due - now;
  if (diff < 0) return "bg-red-50 text-red-700";
  if (diff < 6 * 3600000) return "bg-amber-50 text-amber-700";
  if (diff < 86400000) return "bg-blue-50 text-blue-700";
  return "bg-slate-100 text-slate-600";
};

const waLink = (mobile) =>
  `https://wa.me/91${String(mobile || "").replace(/\D/g, "").slice(-10)}`;

function Kpi({ label, value, sub, danger }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4 px-[18px]">
      <div className="text-xs text-mut">{label}</div>
      <div
        className={`mt-1.5 text-[26px] font-bold tracking-tight ${
          danger ? "text-red-600" : "text-ink"
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11.5px] text-mut">{sub}</div>}
    </div>
  );
}

export default function FollowUps() {
  const { user } = getAuth();
  const isAdmin = user?.role === "admin" && user?.subRole === "super_admin";
  const [leads, setLeads] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [sched, setSched] = useState({ id: null, value: "" });
  const [savingId, setSavingId] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

  const load = useCallback(() => {
    apiFetch("/leads")
      .then((res) => setLeads(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    if (isAdmin) {
      apiFetch("/users/staff")
        .then((res) => setManagers(res.data))
        .catch(() => {});
    }
  }, [load, isAdmin]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const tasks = useMemo(
    () =>
      leads
        .filter((l) => !CLOSED_STATUSES.includes(l.status))
        .filter((l) => l.nextFollowUp)
        .map((l) => ({ ...l, due: dueAt(l) }))
        .sort((a, b) => a.due - b.due),
    [leads]
  );

  const counts = useMemo(() => {
    const overdue = tasks.filter((t) => t.due <= now).length;
    const today = tasks.filter((t) => t.due > now && t.due - now < 86400000).length;
    const later = tasks.length - overdue - today;
    return { overdue, today, later, total: tasks.length };
  }, [tasks, now]);

  const filtered = useMemo(
    () =>
      tasks.filter((t) => {
        if (filter === "overdue" && t.due > now) return false;
        if (filter === "today" && (t.due <= now || t.due - now >= 86400000)) return false;
        if (filter === "later" && t.due - now < 86400000) return false;
        if (
          q &&
          !`${t.name} ${t.mobile} ${t.interest || ""} ${t.city || ""} ${t.state || ""}`
            .toLowerCase()
            .includes(q.toLowerCase())
        )
          return false;
        return true;
      }),
    [tasks, filter, now, q]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  const pageNumbers = useMemo(() => {
    const nums = [];
    const from = Math.max(1, currentPage - 1);
    const to = Math.min(totalPages, currentPage + 1);
    for (let i = from; i <= to; i++) nums.push(i);
    return nums;
  }, [currentPage, totalPages]);

  const resetPaging = () => setPage(1);

  const saveSchedule = async (lead) => {
    if (!sched.value) {
      toast("Pick a date and time first");
      return;
    }
    setSavingId(lead._id);
    try {
      const res = await apiFetch(`/leads/${lead._id}`, {
        method: "PUT",
        body: JSON.stringify({
          nextFollowUp: new Date(sched.value).toISOString(),
        }),
      });
      setLeads((prev) => prev.map((l) => (l._id === res.data._id ? res.data : l)));
      setSched({ id: null, value: "" });
      toast(`Next call scheduled for ${lead.name}`);
    } catch (err) {
      toast(err.message || "Failed to schedule follow up");
    } finally {
      setSavingId(null);
    }
  };

  const filterBtn = (key, label) => (
    <button
      key={key}
      onClick={() => {
        setFilter(key);
        resetPaging();
      }}
      className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${
        filter === key
          ? "bg-primary text-white"
          : "border border-line bg-white text-mut hover:text-primary"
      }`}
    >
      {label}
    </button>
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-[1500px]">
        <h1 className="text-2xl font-bold tracking-tight">Follow Ups</h1>
        <div className="mt-5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-white" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <h1 className="text-2xl font-bold tracking-tight">Follow Ups</h1>
      <p className="mb-5 mt-0.5 text-[13px] text-mut">
        {isAdmin
          ? "Leads with a scheduled next call date, overdue ones first."
          : "Your scheduled calls, with overdue ones first."}
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Overdue"
          value={counts.overdue}
          sub="Needs a call now"
          danger={counts.overdue > 0}
        />
        <Kpi label="Due today" value={counts.today} sub="Within the next 24 hours" />
        <Kpi label="Later" value={counts.later} sub="Scheduled after that" />
        <Kpi label="Pending in total" value={counts.total} sub="Follow-up leads" />
      </div>

      <div className="mb-3.5 mt-5 flex flex-wrap items-center gap-2.5">
        <input
          type="text"
          placeholder="Search name, phone or city"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            resetPaging();
          }}
          className="w-[230px] rounded-lg border border-line bg-white px-2.5 py-2 text-[13px] focus:border-primary focus:outline-none"
        />
        <div className="flex items-center gap-2">
          {filterBtn("all", "All")}
          {filterBtn("overdue", "Overdue")}
          {filterBtn("today", "Due today")}
          {filterBtn("later", "Later")}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-white">
        {pageItems.length ? (
          <div className="divide-y divide-[#f1f0f6]">
            {pageItems.map((l, i) => (
              <div key={l._id}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-[#faf7ff]">
                  <div
                    onClick={() => setOpen(l)}
                    className="flex min-w-[220px] flex-1 cursor-pointer items-center gap-3"
                  >
                    <span className="w-5 flex-none text-right text-[12px] font-semibold text-mut">
                      {start + i + 1}
                    </span>
                    <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">
                      {initials(l.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-semibold">{l.name}</span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${statusMeta(
                            l.status
                          ).cls}`}
                        >
                          {statusMeta(l.status).label}
                        </span>
                        {l.interestCategory && (
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${categoryMeta(
                              l.interestCategory
                            ).cls}`}
                          >
                            {categoryMeta(l.interestCategory).label}
                          </span>
                        )}
                      </div>
                      <div className="text-[11.5px] text-mut">
                        {l.mobile}
                        {l.interest ? ` · ${l.interest}` : ""}
                        {l.city || l.state ? ` · ${l.city || l.state}` : ""}
                        {isAdmin && l.assignedTo ? ` · ${l.assignedTo.name}` : ""}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${dueCls(
                        l.due,
                        now
                      )}`}
                    >
                      {dueLabel(l, l.due, now)}
                    </span>
                    <button
                      onClick={() =>
                        setSched({
                          id: l._id,
                          value: toDateTimeInput(
                            l.nextFollowUp || new Date(now + 24 * 3600000)
                          ),
                        })
                      }
                      className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold hover:border-primary hover:text-primary"
                    >
                      {l.nextFollowUp ? "Reschedule" : "Schedule"}
                    </button>
                    <a
                      href={`tel:+91${String(l.mobile || "").replace(/\D/g, "").slice(-10)}`}
                      className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold hover:border-primary hover:text-primary"
                    >
                      Call
                    </a>
                    <a
                      href={waLink(l.mobile)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold hover:border-primary hover:text-primary"
                    >
                      WhatsApp
                    </a>
                    <button
                      onClick={() => setOpen(l)}
                      className="rounded-lg bg-primary px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-primary-dark"
                    >
                      Open
                    </button>
                  </div>
                </div>

                {sched.id === l._id && (
                  <div className="flex flex-wrap items-center gap-2.5 border-t border-[#f1f0f6] bg-[#fbfbfd] px-4 py-3">
                    <label className="text-[12px] font-semibold text-mut">
                      Next follow up date
                    </label>
                    <input
                      type="datetime-local"
                      value={sched.value}
                      onChange={(e) => setSched((s) => ({ ...s, value: e.target.value }))}
                      className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[13px] focus:border-primary focus:outline-none"
                    />
                    <button
                      onClick={() => saveSchedule(l)}
                      disabled={savingId === l._id}
                      className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
                    >
                      {savingId === l._id ? "Saving..." : "Save date"}
                    </button>
                    <button
                      onClick={() => setSched({ id: null, value: "" })}
                      className="rounded-lg border border-line bg-white px-3 py-1.5 text-[12px] font-semibold text-mut hover:text-ink"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center text-[13px] text-mut">
            Nothing pending. Good work.
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
        <p className="text-xs text-mut">
          {filtered.length
            ? `Showing ${start + 1}-${start + pageItems.length} of ${filtered.length} follow-ups`
            : "No follow-ups to show"}
        </p>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-mut">
            Rows
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                resetPaging();
              }}
              className="rounded-lg border border-line bg-white px-2 py-1 text-[12.5px] focus:border-primary focus:outline-none"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>

            {pageNumbers.map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`h-[30px] min-w-[30px] rounded-lg px-2 text-[12.5px] font-semibold transition ${
                  n === currentPage
                    ? "bg-primary text-white"
                    : "border border-line bg-white text-mut hover:text-primary"
                }`}
              >
                {n}
              </button>
            ))}

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <p className="mt-2.5 text-xs text-mut">
        A lead appears here only after an owner or admin schedules a next call
        date for it. Closing a lead or marking it Not Interested removes it
        from this list.
      </p>

      <LeadDrawer
        lead={open}
        managers={managers}
        isAdmin={isAdmin}
        onClose={() => setOpen(null)}
        onUpdated={(updated) => {
          setLeads((prev) => prev.map((l) => (l._id === updated._id ? updated : l)));
          setOpen(updated);
        }}
      />
    </div>
  );
}
