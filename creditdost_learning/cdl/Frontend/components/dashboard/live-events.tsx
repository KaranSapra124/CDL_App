import { timeAgo } from "@/lib/format";
import type { DashboardData } from "@/lib/dashboard";

export function LiveEvents({ events }: { events: DashboardData["recentEvents"] }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Live system events</h2>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Real-time</span>
      </div>

      {events.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No events yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-600" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm text-slate-900">{e.message}</p>
                <p className="text-xs text-slate-500">
                  {timeAgo(e.createdAt)} · {e.kind}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
