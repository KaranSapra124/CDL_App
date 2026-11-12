"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { listCourses, type ListItem as CourseItem } from "@/lib/courses";
import { formatNumber, formatPaise, timeAgo } from "@/lib/format";
import {
  listStudents,
  studentExportUrl,
  type StudentList,
  type StudentStatus,
} from "@/lib/students";

const TABS: { key: StudentStatus; label: string }[] = [
  { key: "all", label: "All students" },
  { key: "paid", label: "Enrolled" },
  { key: "unpaid", label: "Not enrolled" },
  { key: "certified", label: "Certified" },
];

const LIMIT = 10;

export function StudentDirectory() {
  const router = useRouter();
  const [status, setStatus] = useState<StudentStatus>("all");
  const [q, setQ] = useState("");
  const [course, setCourse] = useState(0);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<StudentList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseItem[]>([]);

  useEffect(() => {
    listCourses({ status: "active", q: "", category: 0, sort: "title", page: 1, limit: 100 })
      .then((r) => setCourses(r.items))
      .catch(() => setCourses([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    listStudents({ status, q, course, page, limit: LIMIT })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        else setError(err instanceof Error ? err.message : "Could not load students.");
      });
    return () => {
      cancelled = true;
    };
  }, [status, q, course, page, router]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  const s = data?.summary;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Students</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Students directory</h1>
          <p className="mt-1 text-sm text-slate-500">Find learners, check enrolments and manage access.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            href={studentExportUrl({ status, q, course })}
            className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold leading-10 text-slate-700 hover:bg-slate-50"
          >
            Export CSV
          </a>
          <Link
            href="/students/enroll"
            className="flex h-10 items-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + Manual enrol
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <SummaryCard label="Registered" value={formatNumber(s?.registered ?? 0)} />
        <SummaryCard label="Enrolled" value={formatNumber(s?.paid ?? 0)} hint="Students with at least one course" />
        <SummaryCard label="Not enrolled" value={formatNumber(s?.unpaid ?? 0)} hint="Registered, no course yet" />
        <SummaryCard label="Revenue" value={formatPaise(s?.revenuePaise ?? 0)} hint="Paid orders, all time" />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name, email or mobile…"
            className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <select
            value={course}
            onChange={(e) => {
              setCourse(Number(e.target.value));
              setPage(1);
            }}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            aria-label="Filter by course"
          >
            <option value={0}>All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 self-start">
          {TABS.map((t) => (
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
              <span className="ml-1.5 text-xs text-slate-400">{formatNumber(data?.counts[t.key] ?? 0)}</span>
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Student</th>
              <th className="px-4 py-3 font-semibold">Contact</th>
              <th className="px-4 py-3 font-semibold">Location</th>
              <th className="px-4 py-3 font-semibold">Courses</th>
              <th className="px-4 py-3 font-semibold">Paid</th>
              <th className="px-4 py-3 font-semibold">Last activity</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {data === null && !error ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  Loading students…
                </td>
              </tr>
            ) : null}
            {data && data.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  {data.total === 0 && status === "all" && !q && course === 0
                    ? "No students yet. Students appear here when they register or are enrolled manually."
                    : "No students match these filters."}
                </td>
              </tr>
            ) : null}
            {data?.items.map((st) => (
              <tr
                key={st.id}
                onClick={() => router.push(`/students/${st.id}`)}
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-3">
                  <Link href={`/students/${st.id}`} className="font-semibold text-slate-900 hover:text-indigo-600">
                    {st.name}
                  </Link>
                  <p className="text-xs text-slate-500">STU-{st.id}</p>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {st.email ?? <span className="text-slate-400">No email</span>}
                  <p className="text-xs text-slate-500">{st.mobile ?? "No mobile"}</p>
                </td>
                <td className="px-4 py-3 text-slate-700">{[st.city, st.state].filter(Boolean).join(", ") || "—"}</td>
                <td className="px-4 py-3 text-slate-700">{st.enrollments}
                  {st.certificates > 0 ? <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Certified</span> : null}
                </td>
                <td className="px-4 py-3 font-semibold text-slate-900">{formatPaise(st.paidPaise)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{timeAgo(st.lastActivityAt)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      st.status === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {st.status === "paid" ? "Enrolled" : "Not enrolled"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.total > 0 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <span>
              Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, data.total)} of {formatNumber(data.total)}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-2">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
