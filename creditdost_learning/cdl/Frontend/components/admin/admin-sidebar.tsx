"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { label: string; href?: string };
type NavGroup = { title: string; items: NavItem[] };

// Items with an href are built. Items without one are shown as "Soon" until their page exists.
const NAV: NavGroup[] = [
  { title: "Overview", items: [{ label: "Dashboard", href: "/dashboard" }] },
  {
    title: "Learning management",
    items: [
      { label: "Courses", href: "/courses" },
      { label: "Videos" },
      { label: "AI Dubbing" },
      { label: "Live Classes" },
    ],
  },
  {
    title: "Students",
    items: [
      { label: "All Students", href: "/students" },
      { label: "Manual Enrollment", href: "/students/enroll" },
      { label: "Certificates" },
    ],
  },
  {
    title: "Commerce",
    items: [{ label: "Transactions" }, { label: "Revenue Analytics" }, { label: "Pricing & Offers" }, { label: "Coupons" }],
  },
  {
    title: "Engagement",
    items: [{ label: "Support Tickets" }, { label: "Notifications" }, { label: "Module Ratings" }],
  },
  { title: "Analytics", items: [{ label: "Platform Analytics" }, { label: "Google Sheets" }] },
  { title: "System", items: [{ label: "Admin Management" }] },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white px-4 py-6 md:flex">
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
            <path d="M22 10 12 5 2 10l10 5 10-5Z" strokeLinejoin="round" />
            <path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <p className="text-base font-bold leading-tight text-slate-900">Credit Dost</p>
          <p className="text-[11px] font-semibold tracking-wider text-indigo-600">LEARNING ADMIN</p>
        </div>
      </div>

      <nav className="flex flex-col gap-6" aria-label="Admin navigation">
        {NAV.map((group) => (
          <div key={group.title}>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {group.title}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                if (!item.href) {
                  return (
                    <li key={item.label}>
                      <span className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-400">
                        {item.label}
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                          Soon
                        </span>
                      </span>
                    </li>
                  );
                }
                const active = pathname === item.href;
                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
