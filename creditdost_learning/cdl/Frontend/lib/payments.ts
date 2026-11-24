// Revenue and transactions. Mirrors the Go API responses. Money is in paise.
import { apiGet } from "./api";

export type RevenueRange = "7d" | "30d" | "90d" | "365d";

export type Revenue = {
  range: RevenueRange;
  grossPaise: number;
  standardPaise: number;
  discountedPaise: number;
  manualPaise: number;
  discountsPaise: number;
  gstPaise: number;
  paidOrders: number;
  refundedOrders: number;
  refundedPaise: number;
  pendingOrders: number;
  failedOrders: number;
};

export type Transaction = {
  id: number;
  code: string;
  studentId: number;
  studentName: string;
  courseTitle: string;
  basePaise: number;
  discountPaise: number;
  gstPaise: number;
  totalPaise: number;
  status: "pending" | "paid" | "failed" | "refunded";
  gateway: "razorpay" | "manual";
  reference: string;
  manualMethod: string;
  createdAt: string;
};

export type TransactionList = {
  items: Transaction[];
  total: number;
  page: number;
  limit: number;
  counts: Record<string, number>;
};

export type TransactionParams = {
  status: string;
  gateway: string;
  q: string;
  page: number;
  limit: number;
};

export function getRevenue(range: RevenueRange): Promise<Revenue> {
  return apiGet<Revenue>(`/admin/revenue?range=${range}`);
}

export function listTransactions(p: TransactionParams): Promise<TransactionList> {
  const qs = new URLSearchParams({ status: p.status, gateway: p.gateway, page: String(p.page), limit: String(p.limit) });
  if (p.q.trim()) qs.set("q", p.q.trim());
  return apiGet<TransactionList>(`/admin/transactions?${qs.toString()}`);
}

export function transactionsExportUrl(p: Omit<TransactionParams, "page" | "limit">): string {
  const qs = new URLSearchParams({ status: p.status, gateway: p.gateway });
  if (p.q.trim()) qs.set("q", p.q.trim());
  return `/api/admin/transactions/export?${qs.toString()}`;
}
