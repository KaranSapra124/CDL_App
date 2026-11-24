"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { ApiError } from "@/lib/api";
import { listStudents, type StudentListItem } from "@/lib/students";
import { formatNumber, timeAgo } from "@/lib/format";
import {
  getNotificationConfig,
  listNotifications,
  sendNotification,
  type NotificationAudience,
  type NotificationConfig,
  type NotificationHistory,
} from "@/lib/notifications";

const AUDIENCES: { value: NotificationAudience; label: string }[] = [
  { value: "all", label: "All students with an email" },
  { value: "paid", label: "Enrolled students" },
  { value: "unpaid", label: "Not yet enrolled" },
  { value: "student", label: "One student" },
];

const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none";

export function NotificationsPage() {
  const router = useRouter();
  const [config, setConfig] = useState<NotificationConfig | null>(null);
  const [history, setHistory] = useState<NotificationHistory | null>(null);
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [audience, setAudience] = useState<NotificationAudience>("all");
  const [studentId, setStudentId] = useState(0);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  function handle(err: unknown) {
    if (err instanceof ApiError && err.status === 401) router.replace("/login");
    else setNotice({ kind: "error", text: err instanceof Error ? err.message : "Something went wrong." });
  }

  useEffect(() => {
    getNotificationConfig().then(setConfig).catch(handle);
    listStudents({ status: "all", q: "", course: 0, page: 1, limit: 100 })
      .then((r) => setStudents(r.items.filter((s) => s.email)))
      .catch(() => setStudents([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    listNotifications(status, page)
      .then((h) => !cancelled && setHistory(h))
      .catch((err: unknown) => !cancelled && handle(err));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page]);

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice(null);
    if (audience === "student" && !studentId) return setNotice({ kind: "error", text: "Choose a student." });
    if (!subject.trim() || !message.trim()) return setNotice({ kind: "error", text: "Enter a subject and a message." });
    setSending(true);
    try {
      const res = await sendNotification({
        audience,
        studentId: audience === "student" ? studentId : undefined,
        subject: subject.trim(),
        body: message.trim(),
      });
      const skipped = res.skippedNoEmail > 0 ? ` ${res.skippedNoEmail} student(s) have no email and were skipped.` : "";
      setNotice({ kind: "ok", text: `Queued ${res.queued} email(s).${skipped} They will be sent in the background.` });
      setSubject("");
      setMessage("");
      setPage(1);
      setStatus("all");
      listNotifications("all", 1).then(setHistory).catch(() => undefined);
    } catch (err) {
      handle(err);
    } finally {
      setSending(false);
    }
  }

  const emailReady = config?.configured ?? false;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Engagement</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Notifications</h1>
        <p className="mt-1 text-sm text-slate-500">Send emails to students. Messages are queued and sent by the server.</p>
      </div>

      {config ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            emailReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {emailReady
            ? `Email is set up. Sending from ${config.from} via ${config.host}.`
            : "Email is not set up yet. Ask the developer to set SMTP_HOST, SMTP_PORT and SMTP_FROM on the server. Until then, messages stay queued."}
        </div>
      ) : null}

      <form onSubmit={send} className="flex max-w-3xl flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-bold text-slate-900">Compose email</h2>
        {notice ? (
          <div role={notice.kind === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${notice.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
            {notice.text}
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            To
            <select value={audience} onChange={(e) => setAudience(e.target.value as NotificationAudience)} className={inputClass}>
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </label>
          {audience === "student" ? (
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Student
              <select value={studentId} onChange={(e) => setStudentId(Number(e.target.value))} className={inputClass}>
                <option value={0}>Choose a student</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} className={inputClass} placeholder="e.g. Your certificate is ready" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Message
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6} className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" placeholder="Plain text. Students without an email address are skipped." />
        </label>
        <div>
          <button type="submit" disabled={sending || !emailReady} className="h-10 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            {sending ? "Queuing…" : "Queue emails"}
          </button>
        </div>
      </form>

      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-slate-900">History</h2>
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {["all", "queued", "sent", "failed"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStatus(s);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${status === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
              >
                {s}
                <span className="ml-1.5 text-xs text-slate-400">{formatNumber(history?.counts[s] ?? 0)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="py-2 pr-4 font-semibold">To</th>
                <th className="py-2 pr-4 font-semibold">Subject</th>
                <th className="py-2 pr-4 font-semibold">Status</th>
                <th className="py-2 pr-4 font-semibold">Queued</th>
                <th className="py-2 font-semibold">Error</th>
              </tr>
            </thead>
            <tbody>
              {history === null ? (
                <tr><td colSpan={5} className="py-6 text-center text-slate-500">Loading…</td></tr>
              ) : null}
              {history && history.items.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-slate-500">No emails yet.</td></tr>
              ) : null}
              {history?.items.map((n) => (
                <tr key={n.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-900">{n.recipient}</td>
                  <td className="py-2 pr-4 text-slate-700">{n.subject}</td>
                  <td className="py-2 pr-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${n.status === "sent" ? "bg-emerald-50 text-emerald-700" : n.status === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                      {n.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-slate-500">{timeAgo(n.createdAt)}</td>
                  <td className="max-w-xs truncate py-2 text-xs text-red-600" title={n.error ?? ""}>{n.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {history && history.total > history.limit ? (
          <div className="flex justify-end gap-2 text-sm">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">Previous</button>
            <button type="button" disabled={page * history.limit >= history.total} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
