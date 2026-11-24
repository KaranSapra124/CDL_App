"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { certificatePdfUrl, listCertificates, type CertificateList } from "@/lib/certificates";
import { formatNumber } from "@/lib/format";

export function CertificatesPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CertificateList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCertificates(q, page)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        else setError(err instanceof Error ? err.message : "Could not load certificates.");
      });
    return () => {
      cancelled = true;
    };
  }, [q, page, router]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Students</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Certificates</h1>
          <p className="mt-1 text-sm text-slate-500">
            Issued certificates. Download a PDF for any student. Issue new ones from the student&apos;s profile.
          </p>
        </div>
        <p className="text-sm text-slate-500">{formatNumber(data?.total ?? 0)} issued</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search by student, course or certificate ID…"
          className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Student</th>
              <th className="px-4 py-3 font-semibold">Course</th>
              <th className="px-4 py-3 font-semibold">Certificate ID</th>
              <th className="px-4 py-3 font-semibold">Issued</th>
              <th className="px-4 py-3 font-semibold">PDF</th>
            </tr>
          </thead>
          <tbody>
            {data === null && !error ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Loading certificates…</td></tr>
            ) : null}
            {data && data.items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No certificates issued yet.</td></tr>
            ) : null}
            {data?.items.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <Link href={`/students/${c.studentId}`} className="font-semibold text-slate-900 hover:text-indigo-600">{c.studentName}</Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{c.courseTitle}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{c.code}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(c.issuedAt).toLocaleDateString("en-IN")}</td>
                <td className="px-4 py-3">
                  <a href={certificatePdfUrl(c.code)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Download PDF
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.total > 0 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">Previous</button>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">Next</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
