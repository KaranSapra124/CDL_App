import { formatPaise, percent } from "@/lib/format";

type Props = {
  avgOrderValuePaise: number;
  conversionRatePct: number;
  refundRatioPct: number;
  completionRatePct: number;
};

export function CheckoutStats(p: Props) {
  const items = [
    { label: "Avg order value", value: formatPaise(p.avgOrderValuePaise), hint: "Paid orders in range" },
    { label: "Conversion rate", value: percent(p.conversionRatePct), hint: "Students who enrolled" },
    { label: "Refund ratio", value: percent(p.refundRatioPct), hint: "Refunded vs paid orders" },
    { label: "Completion rate", value: percent(p.completionRatePct), hint: "Certificates vs enrollments" },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{item.label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{item.value}</p>
          <p className="mt-1 text-xs text-slate-500">{item.hint}</p>
        </div>
      ))}
    </div>
  );
}
