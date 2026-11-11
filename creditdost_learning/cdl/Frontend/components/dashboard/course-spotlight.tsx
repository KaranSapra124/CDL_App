import { formatChange, formatPaise, formatNumber } from "@/lib/format";
import type { DashboardData } from "@/lib/dashboard";

type Props = {
  courses: DashboardData["topCourses"];
  dubbing: DashboardData["dubbing"];
};

export function CourseSpotlight({ courses, dubbing }: Props) {
  const maxRevenue = Math.max(0, ...courses.map((c) => c.revenuePaise));

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Course spotlight</h2>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Top grossing</span>
      </div>

      {courses.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No course sales in this period yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {courses.map((c) => {
            const width = maxRevenue > 0 ? (c.revenuePaise / maxRevenue) * 100 : 0;
            return (
              <li key={c.id} className="rounded-xl bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{c.title}</p>
                    <p className="text-xs text-slate-500">
                      {formatNumber(c.students)} students ·{" "}
                      {c.avgRating !== null ? `★ ${c.avgRating.toFixed(1)}` : "No ratings yet"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-slate-900">{formatPaise(c.revenuePaise)}</p>
                    <p className="text-xs text-slate-500">{formatChange(c.growthPct)}</p>
                  </div>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-indigo-600" style={{ width: `${width}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between rounded-xl bg-indigo-50 p-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {dubbing.languagesLive} of {dubbing.languagesTotal} languages live
          </p>
          <p className="text-xs text-slate-500">
            {dubbing.tracksProcessing > 0
              ? `${dubbing.tracksProcessing} track${dubbing.tracksProcessing === 1 ? "" : "s"} processing`
              : "AI dubbing status"}
          </p>
        </div>
      </div>
    </div>
  );
}
