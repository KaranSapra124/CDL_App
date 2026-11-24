"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { ApiError } from "@/lib/api";
import { formatNumber, formatPaise, timeAgo } from "@/lib/format";
import {
  getRevenue,
  listTransactions,
  transactionsExportUrl,
  type Revenue,
  type RevenueRange,
  type Transaction,
} from "@/lib/payments";

const RANGES: { key: RevenueRange; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "365d", label: "Last 12 months" },
];

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "pending", label: "Pending" },
  { key: "failed", label: "Failed" },
  { key: "refunded", label: "Refunded" },
];

const LIMIT = 10;

export function RevenuePage() {
  const router = useRouter();
  const [range, setRange] = useState<RevenueRange>("30d");
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [status, setStatus] = useState("all");
  const [gateway, setGateway] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRevenue(range)
      .then((r) => !cancelled && setRevenue(r))
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        else setError(err instanceof Error ? err.message : "Could not load revenue.");
      });
    return () => {
      cancelled = true;
    };
  }, [range, router]);

  useEffect(() => {
    let cancelled = false;
    listTransactions({ status, gateway, q, page, limit: LIMIT })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
        setCounts(res.counts);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        else setError(err instanceof Error ? err.message : "Could not load transactions.");
      });
    return () => {
      cancelled = true;
    };
  }, [status, gateway, q, page, router]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Commerce</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Revenue & payments</h1>
          <p className="mt-1 text-sm text-slate-500">Paid orders, discounts, GST and manual receipts.</p>
        </div>
        <div className="flex gap-3">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as RevenueRange)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            aria-label="Revenue period"
          >
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Card label="Gross revenue" value={formatPaise(revenue?.grossPaise ?? 0)} hint={`${formatNumber(revenue?.paidOrders ?? 0)} paid orders`} />
        <Card label="Standard online" value={formatPaise(revenue?.standardPaise ?? 0)} hint="Online, no discount" />
        <Card label="Discounted online" value={formatPaise(revenue?.discountedPaise ?? 0)} hint="Online, with a discount" />
        <Card label="Manual receipts" value={formatPaise(revenue?.manualPaise ?? 0)} hint="Cash, bank transfer, offline UPI" />
        <Card label="Discounts given" value={formatPaise(revenue?.discountsPaise ?? 0)} />
        <Card label="GST collected" value={formatPaise(revenue?.gstPaise ?? 0)} hint="For the accountant" />
        <Card
          label="Refunds"
          value={formatPaise(revenue?.refundedPaise ?? 0)}
          hint={`${formatNumber(revenue?.refundedOrders ?? 0)} refunded in period`}
        />
        <Card label="Pending / failed" value={`${formatNumber(revenue?.pendingOrders ?? 0)} / ${formatNumber(revenue?.failedOrders ?? 0)}`} hint="Pending (all time) / failed in period" />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
            {STATUS_TABS.map((t) => (
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
                <span className="ml-1.5 text-xs text-slate-400">{formatNumber(counts[t.key] ?? 0)}</span>
              </button>
            ))}
          </div>
          <a
            href={transactionsExportUrl({ status, gateway, q })}
            className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold leading-10 text-slate-700 hover:bg-slate-50"
          >
            Export CSV
          </a>
        </div>
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search by student, course or payment reference…"
            className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <select
            value={gateway}
            onChange={(e) => {
              setGateway(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            aria-label="Gateway"
          >
            <option value="all">All gateways</option>
            <option value="razorpay">Online (Razorpay)</option>
            <option value="manual">Manual</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Order</th>
              <th className="px-4 py-3 font-semibold">Student</th>
              <th className="px-4 py-3 font-semibold">Course</th>
              <th className="px-4 py-3 font-semibold">Amount</th>
              <th className="px-4 py-3 font-semibold">Method</th>
              <th className="px-4 py-3 font-semibold">Reference</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">When</th>
            </tr>
          </thead>
          <tbody>
            {items === null ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">Loading transactions…</td>
              </tr>
            ) : null}
            {items && items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  No transactions match these filters.
                </td>
              </tr>
            ) : null}
            {items?.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-semibold text-indigo-600">{t.code}</td>
                <td className="px-4 py-3 text-slate-900">{t.studentName}</td>
                <td className="max-w-[16rem] truncate px-4 py-3 text-slate-700">{t.courseTitle}</td>
                <td className="px-4 py-3">
                  <span className="font-semibold text-slate-900">{formatPaise(t.totalPaise)}</span>
                  {t.discountPaise > 0 ? (
                    <span className="block text-xs text-emerald-600">−{formatPaise(t.discountPaise)} discount</span>
                  ) : null}
                  {t.gstPaise > 0 ? <span className="block text-xs text-slate-500">incl. GST {formatPaise(t.gstPaise)}</span> : null}
                </td>
                <td className="px-4 py-3 capitalize text-slate-700">{t.gateway === "manual" ? t.manualMethod || "Manual" : "Online"}</td>
                <td className="px-4 py-3 text-slate-700">{t.reference || "—"}</td>
                <td className="px-4 py-3">
                  <Pill status={t.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{timeAgo(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items && total > 0 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <span>
              Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {formatNumber(total)}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">
                Previous
              </button>
              <span className="px-2">
                {page} / {totalPages}
              </span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Pill({ status }: { status: Transaction["status"] }): ReactNode {
  const map: Record<Transaction["status"], string> = {
    paid: "bg-emerald-50 text-emerald-700",
    pending: "bg-amber-50 text-amber-700",
    failed: "bg-red-50 text-red-700",
    refunded: "bg-slate-100 text-slate-600",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${map[status]}`}>{status}</span>;
}
