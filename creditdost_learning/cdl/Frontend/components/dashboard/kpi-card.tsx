import type { ReactNode } from "react";

type KpiCardProps = {
  label: string;
  value: string;
  sub?: ReactNode;
  /** Percentage change vs the previous period. Null means no comparison. */
  changePct?: number | null;
};

export function KpiCard({ label, value, sub, changePct }: KpiCardProps) {
  let trendClass = "text-slate-500";
  let trendText: string | null = null;
  if (changePct !== undefined) {
    if (changePct === null) {
      trendText = "No prior period";
    } else {
      trendClass = changePct >= 0 ? "text-emerald-600" : "text-red-600";
      trendText = `${changePct >= 0 ? "▲" : "▼"} ${Math.abs(changePct).toFixed(1)}% vs previous period`;
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-3xl font-bold text-slate-900">{value}</p>
      {trendText ? <p className={`text-xs font-medium ${trendClass}`}>{trendText}</p> : null}
      {sub ? <div className="text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}
