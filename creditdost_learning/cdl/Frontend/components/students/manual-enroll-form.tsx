"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { ApiError } from "@/lib/api";
import { listCourses, type ListItem as CourseItem } from "@/lib/courses";
import { manualEnroll, type ManualEnrollResult } from "@/lib/students";

const METHODS = ["Cash", "Bank transfer", "Offline UPI", "Cheque", "Other"];

const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

export function ManualEnrollForm() {
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [courseId, setCourseId] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [method, setMethod] = useState(METHODS[0]);
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<ManualEnrollResult | null>(null);

  useEffect(() => {
    listCourses({ status: "active", q: "", category: 0, sort: "title", page: 1, limit: 100 })
      .then((r) => setCourses(r.items))
      .catch(() => setCourses([]))
      .finally(() => setLoadingCourses(false));
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!courseId) return setError("Choose a course.");
    if (!email.trim() && !mobile.trim()) return setError("Enter the student's email or mobile number.");
    if (!reference.trim()) return setError("Enter the payment reference or a note, such as a receipt number.");

    setPending(true);
    try {
      const res = await manualEnroll({
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        mobile: mobile.trim() || undefined,
        courseId,
        method,
        reference: reference.trim(),
      });
      setDone(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not enrol the student. Please try again.");
    } finally {
      setPending(false);
    }
  }

  function reset() {
    setDone(null);
    setName("");
    setEmail("");
    setMobile("");
    setReference("");
    setError(null);
  }

  if (done) {
    return (
      <section className="flex flex-col gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-lg font-bold text-emerald-800">Student enrolled</h2>
        <p className="text-sm text-emerald-900">
          {done.createdStudent ? "A new student account was created and " : ""}access to{" "}
          <strong>{done.course}</strong> is now active.
        </p>
        <div className="flex gap-3">
          <Link href={`/students/${done.studentId}`} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
            Open student profile
          </Link>
          <button type="button" onClick={reset} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">
            Enrol another student
          </button>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-3xl flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Manual enrolment</h2>
        <p className="mt-1 text-sm text-slate-500">
          For payments received offline (cash, bank transfer, offline UPI). Enter the student&apos;s email or mobile.
          If no account exists, one is created from the name you enter.
        </p>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Field label="Course">
        <select value={courseId} onChange={(e) => setCourseId(Number(e.target.value))} className={inputClass} disabled={loadingCourses}>
          <option value={0}>{loadingCourses ? "Loading courses…" : "Choose a published course"}</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Email" hint="Use this or mobile, or both.">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="student@example.com" />
        </Field>
        <Field label="Mobile number">
          <input inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} className={inputClass} placeholder="10-digit number" />
        </Field>
      </div>

      <Field label="Full name" hint="Needed only if the student is new.">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Student's full name" />
      </Field>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="How was the payment received?">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reference or note" hint="Receipt number, UTR, or cheque number.">
          <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} placeholder="e.g. RCPT-1042" />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {pending ? "Enrolling…" : "Grant course access"}
        </button>
        <Link href="/students" className="text-sm text-slate-600 hover:text-slate-900">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
