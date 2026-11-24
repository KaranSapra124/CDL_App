"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { formatNumber, timeAgo } from "@/lib/format";
import { listTickets, type TicketList } from "@/lib/support";

const TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "resolved", label: "Resolved" },
];

export function TicketList() {
  const router = useRouter();
  const [status, setStatus] = useState("all");
  const [urgent, setUrgent] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TicketList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTickets(status, urgent ? "urgent" : "all", q, page)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        else setError(err instanceof Error ? err.message : "Could not load tickets.");
      });
    return () => {
      cancelled = true;
    };
  }, [status, urgent, q, page, router]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const s = data?.summary;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Engagement</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Support tickets</h1>
        <p className="mt-1 text-sm text-slate-500">Oldest unresolved tickets first. Replies are emailed to the student.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Card label="Open" value={formatNumber(s?.open ?? 0)} />
        <Card label="In progress" value={formatNumber(s?.inProgress ?? 0)} />
        <Card label="Urgent (unresolved)" value={formatNumber(s?.urgent ?? 0)} tone={s && s.urgent > 0 ? "red" : undefined} />
        <Card
          label="Avg first response"
          value={s?.avgFirstResponseMinutes == null ? "—" : `${Math.round(s.avgFirstResponseMinutes)} min`}
          hint="Last 30 days"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setStatus(t.key);
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                status === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-xs text-slate-400">{formatNumber(data?.counts[t.key] ?? 0)}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={urgent}
            onChange={(e) => {
              setUrgent(e.target.checked);
              setPage(1);
            }}
          />
          Urgent only
        </label>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search subject or student…"
          className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Ticket</th>
              <th className="px-4 py-3 font-semibold">Student</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">Assigned</th>
              <th className="px-4 py-3 font-semibold">Messages</th>
              <th className="px-4 py-3 font-semibold">Opened</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {data === null && !error ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">Loading tickets…</td>
              </tr>
            ) : null}
            {data && data.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  No tickets match these filters. Tickets appear here when students raise them.
                </td>
              </tr>
            ) : null}
            {data?.items.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/support/${t.id}`} className="font-semibold text-slate-900 hover:text-indigo-600">
                    {t.subject}
                  </Link>
                  <p className="text-xs text-slate-500">
                    #{t.id}
                    {t.priority === "urgent" ? <span className="ml-2 font-semibold text-red-600">URGENT</span> : null}
                  </p>
                </td>
                <td className="px-4 py-3 text-slate-700">{t.studentName}</td>
                <td className="px-4 py-3 text-slate-700">{t.category}</td>
                <td className="px-4 py-3 text-slate-700">{t.assignedTo ?? <span className="text-slate-400">Unassigned</span>}</td>
                <td className="px-4 py-3 text-slate-700">{t.messages}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{timeAgo(t.createdAt)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                      t.status === "resolved"
                        ? "bg-emerald-50 text-emerald-700"
                        : t.status === "in_progress"
                          ? "bg-indigo-50 text-indigo-700"
                          : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {t.status.replace("_", " ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.total > 0 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <span>
              Page {page} of {totalPages} · {formatNumber(data.total)} tickets
            </span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">Previous</button>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">Next</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Card({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "red" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tone === "red" ? "text-red-600" : "text-slate-900"}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
