import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { statusMeta, STATUS_META } from "../lib/status";
import { timeAgo } from "../lib/format";
import { getAuth } from "../lib/auth";

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

export default function Dashboard() {
  const { user } = getAuth();
  const isAdmin = user?.role === "admin";
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/leads")
      .then((res) => setLeads(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const total = leads.length;
  const last24 = leads.filter(
    (l) => new Date(l.createdAt) > new Date(Date.now() - 864e5)
  ).length;
  const unassigned = leads.filter((l) => !l.assignedTo).length;
  const assigned = total - unassigned;
  const closed = leads.filter(
    (l) => l.status === "Closed" || l.status === "Sale Closed"
  ).length;
  const notInterested = leads.filter((l) => l.status === "Not Interested").length;
  const convRate = total ? ((closed / total) * 100).toFixed(1) : "0.0";

  const attention = leads
    .filter(
      (l) =>
        !l.assignedTo ||
        l.status === "Work In Progress" ||
        l.status === "Not Contacted" ||
        l.interestCategory === "Follow Up"
    )
    .slice(0, 6);

  const stages = Object.entries(STATUS_META).map(([key, meta]) => ({
    key,
    ...meta,
    n: leads.filter((l) => l.status === key).length,
  }));
  const mx = Math.max(1, ...stages.map((s) => s.n));

  if (loading) {
    return (
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-white" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard overview</h1>
      <p className="mb-5 mt-0.5 text-[13px] text-mut">
        Welcome back, {user?.name || "Admin"}. Here's what's happening today.
      </p>

      {!isAdmin && (
        <div className="mb-4 rounded-xl bg-primary-soft px-4 py-3 text-[13px] text-[#3b1b8a]">
          You are viewing as <b>{user?.name}</b>. You see only the leads assigned
          to you.
        </div>
      )}

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Leads in last 24h" value={last24} sub={`of ${total} total`} />
        <Kpi
          label={isAdmin ? "Unassigned leads" : "New leads"}
          value={unassigned}
          sub={isAdmin ? "Waiting for an owner" : "Waiting for your first call"}
          danger={unassigned > 0}
        />
        <Kpi label={isAdmin ? "Assigned leads" : "My leads"} value={assigned} sub={isAdmin ? "Owned by business managers" : "Assigned to you"} />
        <Kpi label="Closed" value={closed} sub={`${convRate}% conversion rate`} />
        <Kpi label="Not interested" value={notInterested} sub="Marked as not interested" />
      </div>

      <div className="mt-3.5 grid gap-3.5 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border border-line bg-white p-4 px-[18px]">
          <h2 className="mb-3 text-base font-semibold">Needs attention</h2>
          {attention.length ? (
            <div>
              {attention.map((l) => (
                <div
                  key={l._id}
                  className="flex items-center justify-between gap-3 border-b border-[#f1f0f6] py-2.5 last:border-0"
                >
                  <div>
                    <div className="text-[13px] font-medium">{l.name}</div>
                    <div className="text-[11.5px] text-mut">
                      {l.assignedTo
                        ? `${isAdmin ? "Assigned" : "Assigned to you"} · created ${timeAgo(l.createdAt)}`
                        : `No owner yet · created ${timeAgo(l.createdAt)}`}
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${statusMeta(l.status).cls}`}>
                    {statusMeta(l.status).label}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-[13px] text-mut">
              Nothing pending. Good work.
            </div>
          )}
        </div>

        <div className="rounded-xl border border-line bg-white p-4 px-[18px]">
          <h2 className="mb-3 text-base font-semibold">Lead funnel</h2>
          {stages.map((s) => (
            <div key={s.key} className="my-2 grid grid-cols-[110px_1fr_36px] items-center gap-2.5 text-[13px]">
              <span>{s.label}</span>
              <div className="h-2 overflow-hidden rounded bg-[#efedf7]">
                <div className="h-full rounded bg-primary" style={{ width: `${(s.n / mx) * 100}%` }} />
              </div>
              <b className="text-right">{s.n}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
