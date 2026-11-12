"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { ApiError } from "@/lib/api";
import { formatNumber, formatPaise, timeAgo } from "@/lib/format";
import {
  getStudent,
  issueCertificate,
  signOutEverywhere,
  type StudentDetail as Detail,
  type StudentEnrollment,
  type StudentPayment,
} from "@/lib/students";

type Tab = "overview" | "enrollments" | "payments" | "certificates" | "devices";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "enrollments", label: "Enrolments & progress" },
  { key: "payments", label: "Payments" },
  { key: "certificates", label: "Certificates" },
  { key: "devices", label: "Devices" },
];

export function StudentDetail() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    return getStudent(id)
      .then((d) => {
        setDetail(d);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        else setError(err instanceof Error ? err.message : "Could not load this student.");
      });
  }

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    getStudent(id)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        else setError(err instanceof Error ? err.message : "Could not load this student.");
      });
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/students" className="text-sm text-indigo-600">← Students directory</Link>
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      </div>
    );
  }
  if (!detail) return <p className="text-sm text-slate-500">Loading student…</p>;

  const d = detail;

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setNotice(null);
    try {
      const text = await action();
      setNotice({ kind: "ok", text });
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/students" className="text-sm text-indigo-600 hover:text-indigo-700">← Students directory</Link>

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-start md:justify-between">
        <div className="flex gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold text-white">
            {initials(d.profile.name)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{d.profile.name}</h1>
            <p className="text-xs text-slate-500">STU-{d.profile.id} · Registered {new Date(d.profile.registeredAt).toLocaleDateString("en-IN")}</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700">
              <span>{d.profile.email ?? "No email"}</span>
              <span>{d.profile.mobile ?? "No mobile"}</span>
              <span>{[d.profile.city, d.profile.state].filter(Boolean).join(", ") || "No location"}</span>
              <span>Language: {d.profile.preferredLanguage}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/students/enroll" className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold leading-10 text-white hover:bg-indigo-700">
            Grant course access
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm("Sign this student out of every device?")) return;
              void run(async () => {
                const res = await signOutEverywhere(d.profile.id);
                return res.signedOutDevices === 0
                  ? "No devices were signed in."
                  : `Signed out of ${res.signedOutDevices} device${res.signedOutDevices === 1 ? "" : "s"}.`;
              });
            }}
            className="h-10 rounded-lg border border-red-300 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            Sign out everywhere
          </button>
        </div>
      </div>

      {notice ? (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 self-start">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <Overview d={d} /> : null}
      {tab === "enrollments" ? <Enrolments enrollments={d.enrollments} /> : null}
      {tab === "payments" ? <Payments payments={d.payments} totalPaidPaise={d.totalPaidPaise} /> : null}
      {tab === "certificates" ? (
        <Certificates
          d={d}
          busy={busy}
          onIssue={(courseId) =>
            run(async () => {
              const cert = await issueCertificate(d.profile.id, courseId);
              return `Certificate ${cert.code} issued for ${cert.courseTitle}.`;
            })
          }
          onError={(text) => setNotice({ kind: "error", text })}
        />
      ) : null}
      {tab === "devices" ? <Devices d={d} /> : null}
    </div>
  );
}

function Overview({ d }: { d: Detail }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Stat label="Total paid" value={formatPaise(d.totalPaidPaise)} />
      <Stat label="Courses" value={formatNumber(d.enrollments.length)} hint={`${d.enrollments.filter((e) => e.completedModules < e.totalModules || e.totalModules === 0).length} in progress`} />
      <Stat label="Course completion" value={`${d.completionPct.toFixed(0)}%`} hint="Across all enrolled modules" />
      <Stat label="Certificates" value={formatNumber(d.certificates.length)} />
      <Stat label="Active devices" value={`${d.sessions.length} of ${d.deviceLimit}`} hint="Limit per student" />
      <Stat label="Last activity" value={timeAgo(d.profile.lastActivityAt)} />
    </div>
  );
}

function Enrolments({ enrollments }: { enrollments: StudentEnrollment[] }) {
  if (enrollments.length === 0) {
    return <Empty text="This student is not enrolled in any course yet." />;
  }
  return (
    <div className="flex flex-col gap-4">
      {enrollments.map((en) => {
        const pct = en.totalModules > 0 ? (en.completedModules / en.totalModules) * 100 : 0;
        return (
          <section key={en.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-bold text-slate-900">{en.courseTitle}</h2>
                <p className="text-xs text-slate-500">
                  Enrolled {new Date(en.enrolledAt).toLocaleDateString("en-IN")} ·{" "}
                  {en.source === "manual" ? "Manual enrolment" : "Online purchase"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {en.certified ? <Badge tone="green">Certified</Badge> : null}
                <Badge tone="indigo">{Math.round(pct)}% complete</Badge>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-indigo-600" style={{ width: `${pct}%` }} />
            </div>
            {en.modules.length === 0 ? (
              <p className="text-sm text-slate-500">This course has no modules yet.</p>
            ) : (
              <ol className="flex flex-col divide-y divide-slate-100">
                {en.modules.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="flex items-center gap-3">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          m.completed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {m.completed ? "✓" : m.moduleNumber}
                      </span>
                      <span className="text-slate-900">{m.title}</span>
                    </span>
                    <span className="text-xs text-slate-500">
                      {m.completed ? "Completed" : m.watchedSeconds > 0 ? `${formatDuration(m.watchedSeconds)} watched` : "Not started"}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Payments({ payments, totalPaidPaise }: { payments: StudentPayment[]; totalPaidPaise: number }) {
  if (payments.length === 0) return <Empty text="No payments or manual enrolments recorded." />;
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-600">Total paid: <strong className="text-slate-900">{formatPaise(totalPaidPaise)}</strong></p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="py-2 pr-4 font-semibold">Order</th>
              <th className="py-2 pr-4 font-semibold">Course</th>
              <th className="py-2 pr-4 font-semibold">Amount</th>
              <th className="py-2 pr-4 font-semibold">Method</th>
              <th className="py-2 pr-4 font-semibold">Reference</th>
              <th className="py-2 pr-4 font-semibold">Status</th>
              <th className="py-2 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-4 font-semibold text-indigo-600">{p.code}</td>
                <td className="py-2 pr-4 text-slate-900">{p.courseTitle}</td>
                <td className="py-2 pr-4 text-slate-900">
                  {formatPaise(p.totalPaise)}
                  {p.discountPaise > 0 ? <span className="block text-xs text-emerald-600">−{formatPaise(p.discountPaise)} discount</span> : null}
                </td>
                <td className="py-2 pr-4 text-slate-700">{p.gateway === "manual" ? p.manualMethod ?? "Manual" : p.gateway}</td>
                <td className="py-2 pr-4 text-slate-700">{p.gatewayPaymentId ?? "—"}</td>
                <td className="py-2 pr-4"><Badge tone={p.status === "paid" ? "green" : "amber"}>{p.status}</Badge></td>
                <td className="whitespace-nowrap py-2 text-slate-500">{new Date(p.createdAt).toLocaleDateString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Certificates({
  d,
  busy,
  onIssue,
  onError,
}: {
  d: Detail;
  busy: boolean;
  onIssue: (courseId: number) => Promise<void>;
  onError: (text: string) => void;
}) {
  const [courseId, setCourseId] = useState(0);
  const eligible = d.enrollments.filter((e) => !e.certified);

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-bold text-slate-900">Issue a certificate</h2>
        <p className="text-sm text-slate-500">Certificates are normally issued automatically at 100% completion. Use this for manual issue.</p>
        {eligible.length === 0 ? (
          <p className="text-sm text-slate-500">No enrolled course is waiting for a certificate.</p>
        ) : (
          <div className="flex flex-col gap-3 md:flex-row">
            <select value={courseId} onChange={(e) => setCourseId(Number(e.target.value))} className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm">
              <option value={0}>Choose a course</option>
              {eligible.map((e) => (
                <option key={e.courseId} value={e.courseId}>
                  {e.courseTitle}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !courseId}
              onClick={() => {
                if (!courseId) return onError("Choose a course first.");
                void onIssue(courseId);
              }}
              className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Issue certificate
            </button>
          </div>
        )}
      </section>

      {d.certificates.length === 0 ? (
        <Empty text="No certificates issued yet." />
      ) : (
        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {d.certificates.map((c) => (
            <div key={c.id} className="flex flex-col gap-1 rounded-xl bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold text-slate-900">{c.courseTitle}</p>
                <p className="text-xs text-slate-500">Issued {new Date(c.issuedAt).toLocaleDateString("en-IN")}</p>
              </div>
              <p className="font-mono text-sm text-slate-700">{c.code}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Devices({ d }: { d: Detail }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-900">Signed-in devices</h2>
        <Badge tone={d.sessions.length >= d.deviceLimit ? "amber" : "green"}>
          {d.sessions.length} of {d.deviceLimit} in use
        </Badge>
      </div>
      <p className="text-sm text-slate-500">
        Each student may be signed in on {d.deviceLimit} devices at once. A third sign-in signs out the oldest device.
      </p>
      {d.sessions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No devices are signed in.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {d.sessions.map((s) => (
            <li key={s.id} className="flex flex-col gap-1 rounded-xl bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold text-slate-900">{s.deviceLabel || "Unknown device"}</p>
                <p className="text-xs text-slate-500">IP {s.ipAddress || "unknown"}</p>
              </div>
              <p className="text-xs text-slate-500">Last active {timeAgo(s.lastSeenAt)} · signed in {new Date(s.createdAt).toLocaleDateString("en-IN")}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{text}</p>;
}

function Badge({ tone, children }: { tone: "green" | "amber" | "indigo"; children: ReactNode }) {
  const cls = {
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    indigo: "bg-indigo-50 text-indigo-700",
  }[tone];
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${cls}`}>{children}</span>;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
