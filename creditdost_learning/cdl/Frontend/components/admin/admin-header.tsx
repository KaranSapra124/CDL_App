"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiGet, apiPost, type AdminUser } from "@/lib/api";

export function AdminHeader() {
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<AdminUser>("/admin/auth/me")
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        // Not signed in: send them to the login page.
        if (!cancelled) router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function signOut() {
    await apiPost("/admin/auth/logout", {}).catch(() => null);
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-6 backdrop-blur">
      <p className="text-sm text-slate-500">
        Admin <span className="mx-1 text-slate-300">/</span>
        <span className="font-semibold text-slate-900">Console</span>
      </p>

      <div className="flex items-center gap-4">
        {user ? (
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900">{user.name || user.email}</p>
            <p className="text-xs capitalize text-slate-500">{user.role.replace("_", " ")}</p>
          </div>
        ) : (
          <div className="h-9 w-32 animate-pulse rounded bg-slate-100" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={signOut}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
