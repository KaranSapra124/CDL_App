"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { ApiError } from "@/lib/api";
import {
  createCourse,
  getCourseMeta,
  listCourses,
  thumbnailUrl,
  type Category,
  type CourseStatus,
  type ListItem,
  type ListResult,
} from "@/lib/courses";
import { formatNumber, formatPaise } from "@/lib/format";

const TABS: { key: "all" | CourseStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Published" },
  { key: "draft", label: "Drafts" },
  { key: "archived", label: "Archived" },
];

const STATUS_PILL: Record<CourseStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  draft: "bg-amber-50 text-amber-700",
  archived: "bg-slate-100 text-slate-600",
};

export function CourseList() {
  const router = useRouter();
  const [status, setStatus] = useState<"all" | CourseStatus>("all");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState(0);
  const [sort, setSort] = useState<"recent" | "title" | "revenue">("recent");
  const [page, setPage] = useState(1);
  const limit = 10;

  const [data, setData] = useState<ListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    getCourseMeta()
      .then((m) => setCategories(m.categories))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    listCourses({ status, q, category, sort, page, limit })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        else setError(err instanceof Error ? err.message : "Could not load courses.");
      });
    return () => {
      cancelled = true;
    };
  }, [status, q, category, sort, page, router]);

  const counts = data?.counts ?? {};
  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Curriculum governance</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Courses</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage courses, modules, pricing and publishing.
          </p>
        </div>
        <div className="flex items-stretch gap-3">
          <div className="flex gap-6 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total revenue</p>
              <p className="text-lg font-bold text-slate-900">
                {formatPaise(data?.summary.totalRevenuePaise ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Active courses</p>
              <p className="text-lg font-bold text-emerald-600">{formatNumber(data?.summary.activeCourses ?? 0)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + New course
          </button>
        </div>
      </div>

      {showNew ? <NewCourseForm onCreated={(id) => router.push(`/courses/${id}`)} onCancel={() => setShowNew(false)} /> : null}

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
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
              <span className="ml-1.5 text-xs text-slate-400">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search by title, slug or tag…"
          className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <select
          value={category}
          onChange={(e) => {
            setCategory(Number(e.target.value));
            setPage(1);
          }}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
        >
          <option value={0}>All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "recent" | "title" | "revenue")}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
        >
          <option value="recent">Recently updated</option>
          <option value="title">Title A–Z</option>
          <option value="revenue">Highest revenue</option>
        </select>
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
              <th className="px-4 py-3 font-semibold">Course</th>
              <th className="px-4 py-3 font-semibold">Modules</th>
              <th className="px-4 py-3 font-semibold">Students</th>
              <th className="px-4 py-3 font-semibold">Price</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {data === null && !error ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  Loading courses…
                </td>
              </tr>
            ) : null}
            {data && data.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  {data.total === 0 && counts.all === 0 && !q && status === "all" && category === 0
                    ? "No courses yet. Create your first course to get started."
                    : "No courses match these filters."}
                </td>
              </tr>
            ) : null}
            {data?.items.map((c) => (
              <CourseRow key={c.id} course={c} />
            ))}
          </tbody>
        </table>
        {data && data.total > 0 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <span>
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-2 py-1.5">
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

function CourseRow({ course: c }: { course: ListItem }) {
  const discount =
    c.mrpPaise && c.mrpPaise > c.pricePaise
      ? Math.round(((c.mrpPaise - c.pricePaise) / c.mrpPaise) * 100)
      : null;

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50">
      <td className="px-4 py-3">
        <Link href={`/courses/${c.id}`} className="flex items-center gap-3">
          <div className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-xs text-slate-400">
            {c.hasThumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnailUrl(c.id, 0)} alt="" className="h-full w-full object-cover" />
            ) : (
              "No image"
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900 hover:text-indigo-600">{c.title}</p>
            <p className="text-xs text-slate-500">
              {c.category ?? "Uncategorised"}
              {c.instructors.length > 0 ? ` · ${c.instructors.join(", ")}` : ""}
            </p>
          </div>
        </Link>
      </td>
      <td className="px-4 py-3 text-slate-700">
        {c.moduleCount} {c.moduleCount === 1 ? "module" : "modules"}
        <p className="text-xs text-slate-500">{c.readyVideos} video{c.readyVideos === 1 ? "" : "s"} ready</p>
      </td>
      <td className="px-4 py-3 text-slate-700">
        {formatNumber(c.students)}
        <p className="text-xs text-slate-500">{formatPaise(c.revenuePaise)} earned</p>
      </td>
      <td className="px-4 py-3">
        <span className="font-semibold text-slate-900">{formatPaise(c.pricePaise)}</span>
        {c.mrpPaise ? <span className="ml-2 text-xs text-slate-400 line-through">{formatPaise(c.mrpPaise)}</span> : null}
        {discount ? <p className="text-xs font-medium text-emerald-600">{discount}% off</p> : null}
      </td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_PILL[c.status]}`}>
          {c.status === "active" ? "Published" : c.status}
        </span>
      </td>
    </tr>
  );
}

function NewCourseForm({ onCreated, onCancel }: { onCreated: (id: number) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Enter a course title.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const course = await createCourse(title.trim());
      onCreated(course.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the course.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 md:flex-row md:items-center">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Course title, e.g. Credit Card Optimisation"
        className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-indigo-500 focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create draft"}
        </button>
        <button type="button" onClick={onCancel} className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm">
          Cancel
        </button>
      </div>
      {error ? <p className="text-sm text-red-700 md:basis-full">{error}</p> : null}
    </form>
  );
}
