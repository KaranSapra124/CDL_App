// Types that mirror the Go API's /api/admin/dashboard response.
import { apiGet } from "./api";

export type RangeKey = "7d" | "30d" | "90d" | "365d";

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "365d", label: "Last 12 months" },
];

export type Metric = { value: number; changePct: number | null };

export type DashboardData = {
  range: RangeKey;
  kpis: {
    totalStudents: Metric;
    totalEnrollments: Metric;
    totalRevenuePaise: Metric;
    courses: { active: number; draft: number; archived: number };
    pendingOrders: { count: number; amountPaise: number };
    supportTickets: {
      open: number;
      urgent: number;
      unassigned: number;
      avgFirstResponseMinutes: number | null;
    };
  };
  revenueSeries: { month: string; revenuePaise: number; enrollments: number }[];
  checkout: {
    avgOrderValuePaise: number;
    conversionRatePct: number;
    refundRatioPct: number;
    completionRatePct: number;
  };
  topCourses: {
    id: number;
    title: string;
    students: number;
    avgRating: number | null;
    revenuePaise: number;
    growthPct: number | null;
  }[];
  recentOrders: {
    id: number;
    code: string;
    studentName: string;
    courseTitle: string;
    totalPaise: number;
    gateway: string;
    status: "pending" | "paid" | "failed" | "refunded";
    createdAt: string;
  }[];
  recentEvents: { id: number; kind: string; message: string; createdAt: string }[];
  dubbing: { languagesLive: number; languagesTotal: number; tracksProcessing: number };
};

export function fetchDashboard(range: RangeKey): Promise<DashboardData> {
  return apiGet<DashboardData>(`/admin/dashboard?range=${range}`);
}
