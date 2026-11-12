"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { ApiError } from "@/lib/api";
import {
  createCategory,
  createInstructor,
  createModule,
  deleteModule,
  getCourse,
  getCourseMeta,
  publishCourse,
  reorderModules,
  thumbnailUrl,
  updateCourse,
  updateModule,
  uploadCourseThumbnail,
  uploadModuleVideo,
  type Category,
  type Course,
  type CoursePatch,
  type Instructor,
  type Module,
  type ModulePatch,
  type Visibility,
} from "@/lib/courses";
import { formatNumber } from "@/lib/format";

import { VideoPreview } from "./video-preview";

const LANGUAGES: { code: string; label: string }[] = [
  { code: "hi", label: "Hindi" },
  { code: "en", label: "English" },
  { code: "hinglish", label: "Hindi & English (Hinglish)" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "mr", label: "Marathi" },
  { code: "bn", label: "Bengali" },
  { code: "gu", label: "Gujarati" },
];

const VISIBILITY: { value: Visibility; label: string; hint: string }[] = [
  { value: "public", label: "Public listing", hint: "Visible in the catalogue and checkout." },
  { value: "private_link", label: "Private link only", hint: "Hidden from the catalogue; open via its link." },
  { value: "invite_only", label: "Invite only", hint: "Needs manual enrolment or an enterprise code." },
];

type Form = {
  title: string;
  description: string;
  categoryId: number;
  tags: string;
  primaryLanguage: string;
  instructorIds: number[];
  price: string; // rupees, as typed
  mrp: string; // rupees, as typed; blank = none
  certificateEnabled: boolean;
  visibility: Visibility;
};

function toForm(c: Course): Form {
  return {
    title: c.title,
    description: c.description,
    categoryId: c.category?.id ?? 0,
    tags: c.tags.join(", "),
    primaryLanguage: c.primaryLanguage,
    instructorIds: c.instructors.map((i) => i.id),
    price: (c.pricePaise / 100).toString(),
    mrp: c.mrpPaise ? (c.mrpPaise / 100).toString() : "",
    certificateEnabled: c.certificateEnabled,
    visibility: c.visibility,
  };
}

function rupeesToPaise(value: string): number {
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function CourseEditor() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const courseId = Number(params.id);

  const [course, setCourse] = useState<Course | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string; problems?: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [thumbVersion, setThumbVersion] = useState(0);

  useEffect(() => {
    if (!Number.isFinite(courseId)) return;
    let cancelled = false;
    Promise.all([getCourse(courseId), getCourseMeta()])
      .then(([c, meta]) => {
        if (cancelled) return;
        setCourse(c);
        setForm(toForm(c));
        setCategories(meta.categories);
        setInstructors(meta.instructors);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        else setLoadError(errorMessage(err, "Could not load this course."));
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, router]);

  // While any video is waiting or being transcoded, refresh the module list so its status updates on screen.
  const videosPending = course?.modules.some((m) => m.videoStatus === "uploaded" || m.videoStatus === "processing") ?? false;
  useEffect(() => {
    if (!videosPending) return;
    const timer = setInterval(() => {
      getCourse(courseId)
        .then((fresh) => setCourse((prev) => (prev ? { ...prev, modules: fresh.modules } : prev)))
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [videosPending, courseId]);

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/courses" className="text-sm text-indigo-600">← Back to courses</Link>
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      </div>
    );
  }
  if (!course || !form) {
    return <p className="text-sm text-slate-500">Loading course…</p>;
  }

  const current = course;
  const currentForm = form;

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function save(): Promise<Course | null> {
    setSaving(true);
    setNotice(null);
    const patch: CoursePatch = {
      title: currentForm.title.trim(),
      description: currentForm.description,
      categoryId: currentForm.categoryId,
      tags: currentForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
      primaryLanguage: currentForm.primaryLanguage,
      instructorIds: currentForm.instructorIds,
      pricePaise: rupeesToPaise(currentForm.price),
      mrpPaise: currentForm.mrp.trim() ? rupeesToPaise(currentForm.mrp) : 0,
      certificateEnabled: currentForm.certificateEnabled,
      visibility: currentForm.visibility,
    };
    try {
      const updated = await updateCourse(current.id, patch);
      setCourse(updated);
      setForm(toForm(updated));
      setNotice({ kind: "ok", text: "Changes saved." });
      return updated;
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err, "Could not save changes.") });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    const saved = await save();
    if (!saved) return;
    try {
      const published = await publishCourse(saved.id);
      setCourse(published);
      setForm(toForm(published));
      setNotice({ kind: "ok", text: "Course is published and visible to students." });
    } catch (err) {
      const problems = err instanceof ApiError ? err.problems : [];
      setNotice({ kind: "error", text: errorMessage(err, "Could not publish."), problems });
    }
  }

  async function setStatus(status: "draft" | "archived") {
    setSaving(true);
    setNotice(null);
    try {
      const updated = await updateCourse(current.id, { status });
      setCourse(updated);
      setForm(toForm(updated));
      setNotice({ kind: "ok", text: status === "archived" ? "Course archived." : "Course moved back to drafts." });
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err, "Could not change status.") });
    } finally {
      setSaving(false);
    }
  }

  async function addInstructor(name: string, title: string) {
    try {
      const created = await createInstructor(name, title);
      setInstructors((list) => [...list, created].sort((a, b) => a.name.localeCompare(b.name)));
      set("instructorIds", [...currentForm.instructorIds, created.id]);
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err, "Could not add instructor.") });
    }
  }

  async function addCategory(name: string) {
    try {
      const created = await createCategory(name);
      setCategories((list) => [...list, created].sort((a, b) => a.name.localeCompare(b.name)));
      set("categoryId", created.id);
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err, "Could not add category.") });
    }
  }

  function replaceModule(m: Module) {
    setCourse((c) => (c ? { ...c, modules: c.modules.map((x) => (x.id === m.id ? m : x)) } : c));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Link href="/courses" className="text-sm text-indigo-600 hover:text-indigo-700">
            ← Courses
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-900">{current.title || "Untitled course"}</h1>
            <StatusBadge status={current.status} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            ID #{current.id} · /{current.slug}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {current.status !== "active" ? (
            <button
              type="button"
              onClick={publish}
              disabled={saving}
              className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              Publish
            </button>
          ) : null}
          {current.status === "archived" ? (
            <button type="button" onClick={() => setStatus("draft")} disabled={saving} className="h-10 rounded-lg border border-slate-300 px-4 text-sm">
              Restore to drafts
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Archive this course? Students who already bought it keep access.")) setStatus("archived");
              }}
              disabled={saving}
              className="h-10 rounded-lg border border-slate-300 px-4 text-sm text-slate-700"
            >
              Archive
            </button>
          )}
        </div>
      </div>

      {notice ? (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <p>{notice.text}</p>
          {notice.problems && notice.problems.length > 0 ? (
            <ul className="mt-2 list-disc pl-5">
              {notice.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Card title="Basic details">
            <Field label="Course title">
              <input
                value={currentForm.title}
                onChange={(e) => set("title", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Description">
              <textarea
                value={currentForm.description}
                onChange={(e) => set("description", e.target.value)}
                rows={5}
                className={inputClass}
              />
            </Field>
            <Field label="Category">
              <div className="flex gap-2">
                <select
                  value={currentForm.categoryId}
                  onChange={(e) => set("categoryId", Number(e.target.value))}
                  className={inputClass}
                >
                  <option value={0}>No category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <AddInline placeholder="New category" onAdd={addCategory} />
              </div>
            </Field>
            <Field label="Tags" hint="Separate with commas.">
              <input value={currentForm.tags} onChange={(e) => set("tags", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Primary language">
              <select
                value={currentForm.primaryLanguage}
                onChange={(e) => set("primaryLanguage", e.target.value)}
                className={inputClass}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Instructors">
              <div className="flex flex-col gap-2">
                {instructors.length === 0 ? (
                  <p className="text-xs text-slate-500">No instructors yet.</p>
                ) : null}
                {instructors.map((i) => (
                  <label key={i.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={currentForm.instructorIds.includes(i.id)}
                      onChange={(e) =>
                        set(
                          "instructorIds",
                          e.target.checked
                            ? [...currentForm.instructorIds, i.id]
                            : currentForm.instructorIds.filter((x) => x !== i.id),
                        )
                      }
                    />
                    {i.name}
                    {i.title ? <span className="text-xs text-slate-500">· {i.title}</span> : null}
                  </label>
                ))}
                <AddInstructor onAdd={addInstructor} />
              </div>
            </Field>
          </Card>

          <Card title="Thumbnail">
            <div className="flex flex-col gap-3">
              <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-sm text-slate-400">
                {current.hasThumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbnailUrl(current.id, thumbVersion)} alt="" className="h-full w-full object-cover" />
                ) : (
                  "No thumbnail yet"
                )}
              </div>
              <FilePicker
                label={current.hasThumbnail ? "Replace image" : "Upload image"}
                accept="image/jpeg,image/png,image/webp"
                onFile={async (file, setP) => {
                  try {
                    const updated = await uploadCourseThumbnail(current.id, file, setP);
                    setCourse(updated);
                    setThumbVersion((v) => v + 1);
                    setNotice({ kind: "ok", text: "Thumbnail saved." });
                  } catch (err) {
                    setNotice({ kind: "error", text: errorMessage(err, "Thumbnail upload failed.") });
                  }
                }}
              />
              <p className="text-xs text-slate-500">JPEG, PNG or WebP, up to 10 MB.</p>
            </div>
          </Card>

          <Card title="Pricing and access">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Price (₹)">
                <input
                  inputMode="decimal"
                  value={currentForm.price}
                  onChange={(e) => set("price", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="List price (₹)" hint="Shown struck through. Leave blank for none.">
                <input
                  inputMode="decimal"
                  value={currentForm.mrp}
                  onChange={(e) => set("mrp", e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <label className="flex items-center justify-between rounded-xl bg-slate-50 p-4 text-sm">
              <span>
                <span className="font-semibold text-slate-900">Completion certificate</span>
                <span className="block text-xs text-slate-500">Issue a verifiable PDF certificate on completion.</span>
              </span>
              <input
                type="checkbox"
                checked={currentForm.certificateEnabled}
                onChange={(e) => set("certificateEnabled", e.target.checked)}
                className="h-5 w-5"
              />
            </label>
            <div className="flex flex-col gap-2">
              {VISIBILITY.map((v) => (
                <label key={v.value} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3">
                  <input
                    type="radio"
                    name="visibility"
                    checked={currentForm.visibility === v.value}
                    onChange={() => set("visibility", v.value)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{v.label}</span>
                    <span className="block text-xs text-slate-500">{v.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="h-10 rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save details"}
            </button>
          </Card>
        </div>

        <div className="xl:col-span-3">
          <ModulesCard
            course={current}
            onChange={(c) => {
              setCourse(c);
              setForm(toForm(c));
            }}
            onModuleChanged={replaceModule}
            onNotice={setNotice}
          />
        </div>
      </div>
    </div>
  );
}

// ---------- Modules ----------

function ModulesCard({
  course,
  onChange,
  onModuleChanged,
  onNotice,
}: {
  course: Course;
  onChange: (c: Course) => void;
  onModuleChanged: (m: Module) => void;
  onNotice: (n: { kind: "ok" | "error"; text: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("");
  const [free, setFree] = useState(false);
  const [adding, setAdding] = useState(false);
  const modules = course.modules;

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;
    setAdding(true);
    try {
      const m = await createModule(course.id, {
        title: title.trim(),
        durationSeconds: minutes ? Math.round(Number(minutes) * 60) : undefined,
        isFreePreview: free,
      });
      onChange({ ...course, modules: [...course.modules, m] });
      setTitle("");
      setMinutes("");
      setFree(false);
    } catch (err) {
      onNotice({ kind: "error", text: errorMessage(err, "Could not add the module.") });
    } finally {
      setAdding(false);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= modules.length) return;
    const ids = modules.map((m) => m.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    try {
      const reordered = await reorderModules(course.id, ids);
      onChange({ ...course, modules: reordered });
    } catch (err) {
      onNotice({ kind: "error", text: errorMessage(err, "Could not reorder modules.") });
    }
  }

  async function remove(m: Module) {
    if (!window.confirm(`Delete "${m.title}" and its video?`)) return;
    try {
      await deleteModule(m.id);
      onChange({ ...course, modules: course.modules.filter((x) => x.id !== m.id) });
    } catch (err) {
      onNotice({ kind: "error", text: errorMessage(err, "Could not delete the module.") });
    }
  }

  const totalSeconds = modules.reduce((s, m) => s + (m.durationSeconds ?? 0), 0);

  return (
    <Card
      title="Course modules"
      action={
        <span className="text-xs text-slate-500">
          {formatNumber(modules.length)} module{modules.length === 1 ? "" : "s"} · {formatDuration(totalSeconds)}
        </span>
      }
    >
      <form onSubmit={add} className="flex flex-col gap-2 rounded-xl bg-indigo-50 p-4 md:flex-row md:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold text-slate-700">New module title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. How DPD affects approvals" className={inputClass} />
        </div>
        <div className="w-28">
          <label className="mb-1 block text-xs font-semibold text-slate-700">Minutes</label>
          <input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={inputClass} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />
          Free preview
        </label>
        <button type="submit" disabled={adding || !title.trim()} className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
          + Add module
        </button>
      </form>

      {modules.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No modules yet. Add one above, then upload its video.
        </p>
      ) : null}

      <ol className="flex flex-col gap-3">
        {modules.map((m, i) => (
          <ModuleRow
            key={m.id}
            module={m}
            isFirst={i === 0}
            isLast={i === modules.length - 1}
            onMove={(dir) => move(i, dir)}
            onDelete={() => remove(m)}
            onChanged={onModuleChanged}
            onNotice={onNotice}
          />
        ))}
      </ol>
    </Card>
  );
}

function ModuleRow({
  module: m,
  isFirst,
  isLast,
  onMove,
  onDelete,
  onChanged,
  onNotice,
}: {
  module: Module;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onChanged: (m: Module) => void;
  onNotice: (n: { kind: "ok" | "error"; text: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(m.title);
  const [progress, setProgress] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function saveTitle() {
    if (!title.trim() || title.trim() === m.title) {
      setEditing(false);
      setTitle(m.title);
      return;
    }
    try {
      onChanged(await updateModule(m.id, { title: title.trim() }));
      setEditing(false);
    } catch (err) {
      onNotice({ kind: "error", text: errorMessage(err, "Could not rename the module.") });
    }
  }

  async function toggle(flag: "isFreePreview" | "isNew") {
    const patch: ModulePatch = flag === "isFreePreview" ? { isFreePreview: !m.isFreePreview } : { isNew: !m.isNew };
    try {
      onChanged(await updateModule(m.id, patch));
    } catch (err) {
      onNotice({ kind: "error", text: errorMessage(err, "Could not update the module.") });
    }
  }

  async function upload(file: File) {
    setProgress(0);
    try {
      onChanged(await uploadModuleVideo(m.id, file, setProgress));
      onNotice({ kind: "ok", text: `Video uploaded for "${m.title}".` });
    } catch (err) {
      onNotice({ kind: "error", text: errorMessage(err, "Video upload failed.") });
    } finally {
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      {previewing ? <VideoPreview moduleId={m.id} title={m.title} onClose={() => setPreviewing(false)} /> : null}
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          {m.moduleNumber}
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex gap-2">
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} autoFocus />
              <button type="button" onClick={saveTitle} className="rounded-lg bg-slate-900 px-3 text-sm text-white">
                Save
              </button>
            </div>
          ) : (
            <p className="truncate font-semibold text-slate-900">{m.title}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <VideoBadge status={m.videoStatus} error={m.videoError} />
            {m.durationSeconds ? <span>{formatDuration(m.durationSeconds)}</span> : null}
            {m.videoSizeBytes ? <span>{(m.videoSizeBytes / 1024 / 1024).toFixed(1)} MB</span> : null}
            {m.isFreePreview ? <span className="rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-700">Free preview</span> : null}
            {m.isNew ? <span className="rounded-full bg-fuchsia-50 px-2 py-0.5 font-medium text-fuchsia-700">New</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label="Move up" disabled={isFirst} onClick={() => onMove(-1)}>↑</IconButton>
          <IconButton label="Move down" disabled={isLast} onClick={() => onMove(1)}>↓</IconButton>
          {m.videoStatus === "ready" ? (
            <IconButton label="Preview video" onClick={() => setPreviewing(true)}>▶</IconButton>
          ) : null}
          <IconButton label="Rename" onClick={() => setEditing((v) => !v)}>✎</IconButton>
          <IconButton label="Delete" onClick={onDelete}>🗑</IconButton>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 text-sm">
        <label className="flex items-center gap-2 text-slate-700">
          <input type="checkbox" checked={m.isFreePreview} onChange={() => toggle("isFreePreview")} />
          Free preview
        </label>
        <label className="flex items-center gap-2 text-slate-700">
          <input type="checkbox" checked={m.isNew} onChange={() => toggle("isNew")} />
          Mark as new
        </label>
        <div className="ml-auto flex items-center gap-3">
          {progress !== null ? (
            <span className="text-xs text-slate-600">Uploading {Math.round(progress * 100)}%</span>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
            id={`video-${m.id}`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <label
            htmlFor={`video-${m.id}`}
            className={`cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 ${
              progress !== null ? "pointer-events-none opacity-50" : ""
            }`}
          >
            {m.videoStatus === "none" ? "Upload video" : "Replace video"}
          </label>
        </div>
      </div>
    </li>
  );
}

// ---------- Small pieces ----------

const inputClass =
  "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
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

function StatusBadge({ status }: { status: Course["status"] }) {
  const cls =
    status === "active"
      ? "bg-emerald-50 text-emerald-700"
      : status === "draft"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-600";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${cls}`}>
      {status === "active" ? "Published" : status}
    </span>
  );
}

function VideoBadge({ status, error }: { status: Module["videoStatus"]; error: string | null }) {
  const map: Record<Module["videoStatus"], { text: string; cls: string }> = {
    none: { text: "No video", cls: "bg-slate-100 text-slate-600" },
    uploaded: { text: "Uploaded · waiting to process", cls: "bg-amber-50 text-amber-700" },
    processing: { text: "Processing", cls: "bg-sky-50 text-sky-700" },
    ready: { text: "Ready", cls: "bg-emerald-50 text-emerald-700" },
    failed: { text: error ? `Failed: ${error}` : "Failed", cls: "bg-red-50 text-red-700" },
  };
  const v = map[status];
  return <span className={`rounded-full px-2 py-0.5 font-medium ${v.cls}`}>{v.text}</span>;
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function FilePicker({
  label,
  accept,
  onFile,
}: {
  label: string;
  accept: string;
  onFile: (file: File, setProgress: (f: number) => void) => Promise<void>;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const id = `file-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setProgress(0);
          await onFile(file, setProgress);
          setProgress(null);
          e.target.value = "";
        }}
      />
      <label htmlFor={id} className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">
        {label}
      </label>
      {progress !== null ? <span className="text-xs text-slate-600">{Math.round(progress * 100)}%</span> : null}
    </div>
  );
}

function AddInline({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-36 rounded-lg border border-slate-300 px-2 text-sm"
      />
      <button
        type="button"
        disabled={!value.trim()}
        onClick={async () => {
          await onAdd(value.trim());
          setValue("");
        }}
        className="h-10 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-40"
      >
        Add
      </button>
    </div>
  );
}

function AddInstructor({ onAdd }: { onAdd: (name: string, title: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  return (
    <div className="mt-2 grid grid-cols-1 gap-2 rounded-xl bg-slate-50 p-3 md:grid-cols-[1fr_1fr_auto]">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New instructor name" className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Role / title" className="h-9 rounded-lg border border-slate-300 px-2 text-sm" />
      <button
        type="button"
        disabled={!name.trim()}
        onClick={async () => {
          await onAdd(name.trim(), title.trim());
          setName("");
          setTitle("");
        }}
        className="h-9 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-40"
      >
        Add
      </button>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
