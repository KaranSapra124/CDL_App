"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from "react";

import { ApiError } from "@/lib/api";
import { formatNumber, timeAgo } from "@/lib/format";
import {
  assignTicket,
  attachmentUrl,
  getTicket,
  replyToTicket,
  setTicketStatus,
  type Ticket,
  type TicketStatus,
} from "@/lib/support";

type AdminMe = { id: number; name: string };

export function TicketThread() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [me, setMe] = useState<AdminMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    getTicket(id)
      .then((t) => !cancelled && setTicket(t))
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        else setError(err instanceof Error ? err.message : "Could not load this ticket.");
      });
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<AdminMe>) : null))
      .then((u) => !cancelled && u && setMe(u))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Clean up the preview URL when the attachment changes.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function attach(f: File | null) {
    setFile(f);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return f ? URL.createObjectURL(f) : null;
    });
  }

  // Pasting a screenshot (Ctrl+V) attaches it directly, the same as choosing a file.
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const image = items.find((i) => i.type.startsWith("image/"));
    if (!image) return;
    const pasted = image.getAsFile();
    if (!pasted) return;
    e.preventDefault();
    attach(new File([pasted], `screenshot-${Date.now()}.png`, { type: pasted.type || "image/png" }));
  }

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!body.trim() && !file) {
      setError("Write a reply or paste a screenshot first.");
      return;
    }
    setBusy(true);
    try {
      const updated = await replyToTicket(id, body.trim(), file);
      setTicket(updated);
      setBody("");
      attach(null);
      if (fileRef.current) fileRef.current.value = "";
      setNotice("Reply sent. The student has been emailed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reply.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: TicketStatus) {
    setBusy(true);
    setError(null);
    try {
      setTicket(await setTicketStatus(id, status));
      setNotice(status === "resolved" ? "Ticket marked resolved." : "Ticket status updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the status.");
    } finally {
      setBusy(false);
    }
  }

  async function assignToMe() {
    if (!me) return;
    setBusy(true);
    setError(null);
    try {
      setTicket(await assignTicket(id, me.id));
      setNotice("Assigned to you.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign the ticket.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !ticket) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/support" className="text-sm text-indigo-600">← Support tickets</Link>
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      </div>
    );
  }
  if (!ticket) return <p className="text-sm text-slate-500">Loading ticket…</p>;

  const t = ticket;
  return (
    <div className="flex flex-col gap-6">
      <Link href="/support" className="text-sm text-indigo-600 hover:text-indigo-700">← Support tickets</Link>

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{t.subject}</h1>
            {t.priority === "urgent" ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">URGENT</span> : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Ticket #{t.id} · {t.category} · opened {timeAgo(t.createdAt)}
          </p>
          <p className="mt-3 text-sm text-slate-700">
            <Link href={`/students/${t.studentId}`} className="font-semibold text-indigo-600">{t.studentName}</Link>
            {t.studentEmail ? <span> · {t.studentEmail}</span> : null}
            {t.studentMobile ? <span> · {t.studentMobile}</span> : null}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <span className="text-sm text-slate-600">
            Assigned: <strong>{t.assignedTo ?? "nobody"}</strong>
          </span>
          <div className="flex flex-wrap gap-2">
            {t.assignedAdminId !== me?.id && me ? (
              <button type="button" disabled={busy} onClick={assignToMe} className="h-9 rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50 disabled:opacity-50">
                Assign to me
              </button>
            ) : null}
            {t.status === "resolved" ? (
              <button type="button" disabled={busy} onClick={() => changeStatus("open")} className="h-9 rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50 disabled:opacity-50">
                Reopen
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => changeStatus("resolved")} className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                Mark resolved
              </button>
            )}
          </div>
        </div>
      </div>

      {notice ? <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}
      {error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-bold text-slate-900">Conversation · {formatNumber(t.messages.length)} messages</h2>
        {t.messages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No replies yet.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {t.messages.map((m) => (
              <li key={m.id} className={`flex flex-col gap-2 rounded-xl p-4 ${m.authorType === "admin" ? "bg-indigo-50" : "bg-slate-50"}`}>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">
                    {m.authorType === "admin" ? `${m.authorName} (support)` : m.authorName}
                  </span>
                  <span>{timeAgo(m.createdAt)}</span>
                </div>
                {m.body ? <p className="whitespace-pre-wrap text-sm text-slate-900">{m.body}</p> : null}
                {m.hasAttachment ? (
                  <a href={attachmentUrl(t.id, m.id)} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- admin-only screenshot, not a static asset */}
                    <img src={attachmentUrl(t.id, m.id)} alt="Attachment" className="max-h-72 rounded-lg border border-slate-200 bg-white" />
                  </a>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <form onSubmit={send} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-bold text-slate-900">Reply to student</h2>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onPaste={onPaste}
          rows={4}
          placeholder="Write your reply. You can paste a screenshot here with Ctrl+V."
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        {preview ? (
          <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Screenshot to send" className="max-h-40 rounded border border-slate-200" />
            <button type="button" onClick={() => { attach(null); if (fileRef.current) fileRef.current.value = ""; }} className="text-sm text-red-600 hover:underline">
              Remove screenshot
            </button>
          </div>
        ) : null}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => attach(e.target.files?.[0] ?? null)}
            />
            or attach an image (JPEG, PNG, WebP)
          </label>
          <button type="submit" disabled={busy} className="h-10 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
            {busy ? "Sending…" : "Send reply"}
          </button>
        </div>
      </form>
    </div>
  );
}
