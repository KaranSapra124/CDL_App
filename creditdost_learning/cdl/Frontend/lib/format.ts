// Display helpers. Money from the API is always in paise (1 rupee = 100 paise).

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("en-IN");

export function formatPaise(paise: number): string {
  return inr.format(paise / 100);
}

export function formatNumber(n: number): string {
  return number.format(n);
}

/** Shows a signed percentage like "+12.4%" or "-3.0%". Null means there is nothing to compare. */
export function formatChange(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "No prior period";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export function percent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** "2026-06" -> "Jun" */
export function monthLabel(ym: string): string {
  const [year, month] = ym.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

/** ISO timestamp -> "2 mins ago", "3 hours ago", "5 days ago". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
