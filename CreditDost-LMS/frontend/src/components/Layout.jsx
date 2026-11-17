import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { getAuth, clearAuth } from "../lib/auth";
import { initials } from "../lib/format";

const ICON_PATHS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  leads: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  followups: (
    <>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      <path d="M14.05 2a9 9 0 0 1 8 7.94" />
      <path d="M14.05 6A5 5 0 0 1 18 10" />
    </>
  ),
  import: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </>
  ),
};

function Icon({ name, className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

const TABS = [
  { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "/leads", label: "All Leads", icon: "leads" },
  { to: "/follow-ups", label: "Follow Ups", icon: "followups" },
  { to: "/import", label: "Import Leads", icon: "import", adminOnly: true },
];

const navCls = ({ isActive }) =>
  `group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
    isActive
      ? "bg-primary text-white shadow-sm shadow-primary/30"
      : "text-slate-600 hover:bg-page hover:text-primary"
  }`;

export default function Layout() {
  const navigate = useNavigate();
  const { user } = getAuth();
  
  const isAdmin = user?.role === "admin" && user?.subRole === 'super_admin';
  
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
        className={`fixed inset-y-0 left-0 z-40 flex w-[220px] flex-col border-r border-line bg-white transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex h-[50px] flex-none items-center gap-2.5 border-b border-line px-4">
          <div className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-primary text-[12px] font-bold text-white">
            CD
          </div>
          <div className="text-[17px] font-bold tracking-tight text-ink">
            Credit<span className="text-primary">Dost</span>
          </div>
        </div>

        <p className="px-5 pb-1.5 pt-5 text-[10.5px] font-semibold uppercase tracking-wider text-mut/80">
          Menu
        </p>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4 pt-1">
          {TABS.filter((t) => !t.adminOnly || isAdmin).map((t) => (
            <NavLink key={t.to} to={t.to} className={navCls} onClick={() => setOpen(false)}>
              <Icon name={t.icon} className="h-[18px] w-[18px] flex-none" />
              {t.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex-none border-t border-line p-3">
          <div className="flex items-center gap-2.5 rounded-xl bg-page px-3 py-2.5">
            <div className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[#2ecc8f] text-[12px] font-bold text-white">
              {initials(user?.name || "A")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold text-ink">
                {user?.name || "Admin"}
              </div>
              <div className="truncate text-[10.5px] text-mut">
                {isAdmin ? "Administrator" : user?.subRole || "Staff"}
                {user?.staffCode ? ` · ${user.staffCode}` : ""}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              aria-label="Logout"
              className="flex-none rounded-lg p-1.5 text-mut transition hover:bg-white hover:text-red-600"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
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
          <b className="text-[15px] font-bold">
            {isAdmin ? "Admin Dashboard" : `Welcome ${user?.name || "there"}`}
          </b>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs opacity-90 sm:inline">
            {user?.name}
            {user?.staffCode ? ` · ${user.staffCode}` : ""}
          </span>
          <div className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[#2ecc8f] text-[13px] font-bold">
            {initials(user?.name || "A")}
          </div>
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
