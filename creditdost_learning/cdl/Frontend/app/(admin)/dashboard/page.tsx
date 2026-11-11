"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CheckoutStats } from "@/components/dashboard/checkout-stats";
import { CourseSpotlight } from "@/components/dashboard/course-spotlight";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { LiveEvents } from "@/components/dashboard/live-events";
import { RecentOrders } from "@/components/dashboard/recent-orders";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { ApiError } from "@/lib/api";
import {
  fetchDashboard,
  RANGE_OPTIONS,
  type DashboardData,
  type RangeKey,
} from "@/lib/dashboard";
import { formatNumber, formatPaise } from "@/lib/format";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: DashboardData };

export default function DashboardPage() {
  const router = useRouter();
  const [range, setRange] = useState<RangeKey>("30d");
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchDashboard(range)
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Could not load the dashboard.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [range, router]);

  function changeRange(next: RangeKey) {
    setRange(next);
    setState({ status: "loading" });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Telemetry & operations</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Dashboard overview</h1>
          <p className="mt-1 text-sm text-slate-500">
            Learning engagement and revenue, read live from the database.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Period
          <select
            value={range}
            onChange={(e) => changeRange(e.target.value as RangeKey)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
          >
            {RANGE_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.status === "error" ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.message}
        </div>
      ) : null}

      {state.status === "loading" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : null}

      {state.status === "ready" ? <DashboardBody data={state.data} /> : null}
    </div>
  );
}

function DashboardBody({ data }: { data: DashboardData }) {
  const k = data.kpis;
  const courseTotal = k.courses.active + k.courses.draft + k.courses.archived;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Total students"
          value={formatNumber(k.totalStudents.value)}
          changePct={k.totalStudents.changePct}
        />
        <KpiCard
          label="Total enrollments"
          value={formatNumber(k.totalEnrollments.value)}
          changePct={k.totalEnrollments.changePct}
        />
        <KpiCard
          label="Total revenue"
          value={formatPaise(k.totalRevenuePaise.value)}
          changePct={k.totalRevenuePaise.changePct}
        />
        <KpiCard
          label="Active courses"
          value={`${formatNumber(k.courses.active)} published`}
          sub={`${k.courses.draft} in draft · ${k.courses.archived} archived · ${courseTotal} total`}
        />
        <KpiCard
          label="Pending orders"
          value={`${formatNumber(k.pendingOrders.count)} orders`}
          sub={`${formatPaise(k.pendingOrders.amountPaise)} awaiting payment`}
        />
        <KpiCard
          label="Support tickets"
          value={`${formatNumber(k.supportTickets.open)} open`}
          sub={
            <>
              {k.supportTickets.urgent} urgent · {k.supportTickets.unassigned} unassigned ·{" "}
              {k.supportTickets.avgFirstResponseMinutes === null
                ? "no responses yet"
                : `avg response ${Math.round(k.supportTickets.avgFirstResponseMinutes)} min`}
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RevenueChart data={data.revenueSeries} />
        </div>
        <CourseSpotlight courses={data.topCourses} dubbing={data.dubbing} />
      </div>

      <CheckoutStats {...data.checkout} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RecentOrders orders={data.recentOrders} />
        </div>
        <LiveEvents events={data.recentEvents} />
      </div>
    </>
  );
}
