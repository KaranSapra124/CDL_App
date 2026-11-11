"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatNumber, formatPaise, monthLabel } from "@/lib/format";

type Point = { month: string; revenuePaise: number; enrollments: number };

export function RevenueChart({ data }: { data: Point[] }) {
  const chartData = data.map((p) => ({
    label: monthLabel(p.month),
    revenue: p.revenuePaise / 100,
    enrollments: p.enrollments,
  }));
  const hasData = data.some((p) => p.revenuePaise > 0 || p.enrollments > 0);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Revenue & enrollment velocity</h2>
        <p className="text-sm text-slate-500">Last six months: paid revenue and new enrollments</p>
      </div>

      {hasData ? (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} />
              <YAxis
                yAxisId="revenue"
                tick={{ fontSize: 12, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `₹${formatNumber(Math.round(v / 1000))}k`}
                width={70}
              />
              <YAxis
                yAxisId="enrollments"
                orientation="right"
                tick={{ fontSize: 12, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                formatter={(value, name) =>
                  name === "Revenue"
                    ? formatPaise(Number(value) * 100)
                    : formatNumber(Number(value))
                }
              />
              <Legend />
              <Line
                yAxisId="revenue"
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke="#4f46e5"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
              <Line
                yAxisId="enrollments"
                type="monotone"
                dataKey="enrollments"
                name="Enrollments"
                stroke="#059669"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500">
          No revenue or enrollments in the last six months yet.
        </div>
      )}
    </div>
  );
}
