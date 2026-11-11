import { formatPaise, timeAgo } from "@/lib/format";
import type { DashboardData } from "@/lib/dashboard";

type Order = DashboardData["recentOrders"][number];

const STATUS: Record<Order["status"], { label: string; className: string }> = {
  paid: { label: "Completed", className: "bg-emerald-50 text-emerald-700" },
  pending: { label: "Processing", className: "bg-amber-50 text-amber-700" },
  failed: { label: "Failed", className: "bg-red-50 text-red-700" },
  refunded: { label: "Refunded", className: "bg-slate-100 text-slate-600" },
};

export function RecentOrders({ orders }: { orders: Order[] }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Recent orders & transactions</h2>
        <p className="text-sm text-slate-500">Latest checkout activity</p>
      </div>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No orders yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="py-2 pr-4 font-semibold">Order</th>
                <th className="py-2 pr-4 font-semibold">Student</th>
                <th className="py-2 pr-4 font-semibold">Course</th>
                <th className="py-2 pr-4 font-semibold">Amount</th>
                <th className="py-2 pr-4 font-semibold">Gateway</th>
                <th className="py-2 pr-4 font-semibold">Status</th>
                <th className="py-2 font-semibold">Time</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const status = STATUS[o.status];
                return (
                  <tr key={o.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4 font-semibold text-indigo-600">{o.code}</td>
                    <td className="py-3 pr-4 text-slate-900">{o.studentName}</td>
                    <td className="max-w-[16rem] truncate py-3 pr-4 text-slate-700">{o.courseTitle}</td>
                    <td className="py-3 pr-4 font-semibold text-slate-900">{formatPaise(o.totalPaise)}</td>
                    <td className="py-3 pr-4 capitalize text-slate-600">{o.gateway}</td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-3 text-slate-500">{timeAgo(o.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
