import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden="true">
              <path d="M22 10 12 5 2 10l10 5 10-5Z" strokeLinejoin="round" />
              <path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-slate-900">Credit Dost</p>
            <p className="text-xs font-semibold tracking-wider text-indigo-600">LEARNING ADMIN</p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
