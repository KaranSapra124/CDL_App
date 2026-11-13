import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { getAuth, clearAuth } from "../lib/auth";
import { initials } from "../lib/format";

const LEAD_TABS = [
  { to: "/leads", label: "All Leads" },
  { to: "/follow-ups", label: "Follow-ups" },
  { to: "/payments", label: "Payment Matching" },
];

const ADMIN_TABS = [
  { to: "/rules", label: "Assignment Rules" },
  { to: "/staff", label: "Staff Performance" },
  { to: "/campaigns", label: "Campaign ROI" },
  { to: "/audit", label: "Audit Log" },
];

const EXISTING = [
  "Team & Roles",
  "Manage Franchise",
  "Manage Customers",
  "Credit Check",
  "View Reports",
  "Business MIS",
  "Support Tickets",
];

const navCls = ({ isActive }) =>
  `flex items-center gap-3 w-full rounded-lg px-3 py-2 text-[13px] font-medium transition ${
    isActive
      ? "bg-primary text-white"
      : "text-[#3a3950] hover:bg-primary-soft hover:text-primary"
  }`;

export default function Layout() {
  const navigate = useNavigate();
  const { user } = getAuth();
  const isAdmin = user?.role === "admin";
  const [open, setOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  useEffect(() => {
    let t;
    const onToast = (e) => {
      setToastMsg(e.detail);
      clearTimeout(t);
      t = setTimeout(() => setToastMsg(""), 2600);
    };
    window.addEventListener("app-toast", onToast);
    return () => {
      window.removeEventListener("app-toast", onToast);
      clearTimeout(t);
    };
  }, []);

  const handleLogout = () => {
    clearAuth();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-page">
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[220px] overflow-y-auto border-r border-line bg-white pb-6 transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex h-[50px] items-center px-4 text-xl font-bold tracking-tight text-[#2a1a6e]">
          Credit<span className="text-primary">Dost</span>
        </div>

        <div className="px-2 py-1">
          <NavLink to="/dashboard" className={navCls}>
            <span className="h-3.5 w-3.5 rounded bg-current opacity-30" />
            Dashboard
          </NavLink>
        </div>

        <p className="px-4 pb-1.5 pt-4 text-xs font-semibold text-mut">
          Lead management
        </p>
        <div className="space-y-px px-2">
          {LEAD_TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={navCls} onClick={() => setOpen(false)}>
              <span className="h-3.5 w-3.5 rounded bg-current opacity-30" />
              {t.label}
            </NavLink>
          ))}
        </div>

        {isAdmin && (
          <>
            <div className="space-y-px px-2 pt-1">
              {ADMIN_TABS.map((t) => (
                <NavLink key={t.to} to={t.to} className={navCls} onClick={() => setOpen(false)}>
                  <span className="h-3.5 w-3.5 rounded bg-current opacity-30" />
                  {t.label}
                </NavLink>
              ))}
            </div>

            <p className="px-4 pb-1.5 pt-5 text-xs font-semibold text-mut">
              Existing menu
            </p>
            <div className="space-y-px px-2">
              {EXISTING.map((e) => (
                <button
                  key={e}
                  onClick={() => toast(`${e} — coming from your existing platform`)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-[#7d7c92] transition hover:bg-primary-soft/50"
                >
                  <span className="h-3.5 w-3.5 rounded bg-[#cfcde0]" />
                  {e}
                </button>
              ))}
            </div>
          </>
        )}
      </aside>

      <header className="fixed left-0 right-0 top-0 z-20 flex h-[50px] items-center justify-between bg-primary px-5 text-white md:left-[220px]">
        <div className="flex items-center gap-3">
          <button
            className="text-xl md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            ☰
          </button>
          <b className="text-[15px] font-bold">Admin Dashboard</b>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs opacity-90 sm:inline">
            {user?.name}
            {user?.staffCode ? ` · ${user.staffCode}` : ""}
          </span>
          <div className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[#2ecc8f] text-[13px] font-bold">
            {initials(user?.name || "A")}
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/10"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="ml-0 px-4 pb-12 pt-[70px] md:ml-[220px] md:px-6">
        <Outlet />
      </main>

      <div
        className={`pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-[13px] text-white shadow-lg transition-all ${
          toastMsg ? "opacity-100" : "translate-y-3 opacity-0"
        }`}
        role="status"
      >
        {toastMsg}
      </div>
    </div>
  );
}
