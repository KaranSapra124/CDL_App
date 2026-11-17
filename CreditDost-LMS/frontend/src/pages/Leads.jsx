import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { statusMeta, categoryMeta, STATUS_META, CATEGORY_META } from "../lib/status";
import { timeAgo, initials } from "../lib/format";
import LeadDrawer from "../components/LeadDrawer";
import { getAuth } from "../lib/auth";

const PAGE_SIZES = [10, 25, 50];

export default function Leads() {
  const { user } = getAuth();
  const isAdmin = user?.role === "admin" && user?.subRole === 'super_admin';
  const [leads, setLeads] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", page);
    params.set("limit", pageSize);
    if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    if (owner) params.set("owner", owner);
    return params.toString();
  }, [page, pageSize, debouncedQ, category, status, owner]);

  const load = useCallback(() => {
    apiFetch(`/leads?${query}`)
      .then((res) => {
        setLeads(res.data);
        setTotal(res.total);
        setPages(res.pages);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isAdmin) {
      apiFetch("/users/staff")
        .then((res) => setManagers(res.data))
        .catch(() => {});
    }
  }, [isAdmin]);

  const resetPaging = () => setPage(1);

  const openLead = (id) => setOpen(leads.find((l) => l._id === id) || null);

  const pageNumbers = useMemo(() => {
    const nums = [];
    const from = Math.max(1, page - 1);
    const to = Math.min(pages, page + 1);
    for (let i = from; i <= to; i++) nums.push(i);
    return nums;
  }, [page, pages]);

  const selectCls =
    "rounded-lg border border-line bg-white px-2.5 py-2 text-[13px] focus:border-primary focus:outline-none";

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="mb-5 mt-0.5 text-[13px] text-mut">
            {isAdmin
              ? "Every lead has exactly one owner. Only an admin can change it."
              : "Showing only the leads assigned to you."}
          </p>
        </div>
        <span className="whitespace-nowrap rounded-lg border border-line bg-white px-3 py-1.5 text-[13px] font-semibold text-mut">
          {total} total leads
        </span>
      </div>

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <input
          type="text"
          placeholder="Search name, phone or ID"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            resetPaging();
          }}
          className={`w-[230px] ${selectCls}`}
        />
        <select
          className={selectCls}
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            resetPaging();
          }}
        >
          <option value="">All categories</option>
          {Object.entries(CATEGORY_META).map(([key, m]) => (
            <option key={key} value={key}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            resetPaging();
          }}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_META).map(([key, m]) => (
            <option key={key} value={key}>
              {m.label}
            </option>
          ))}
        </select>
        {isAdmin && (
          <select
            className={selectCls}
            value={owner}
            onChange={(e) => {
              setOwner(e.target.value);
              resetPaging();
            }}
          >
            <option value="">All owners</option>
            {managers.map((m) => (
              <option key={m._id} value={m._id}>
                {m.name}
                {m.staffCode ? ` (${m.staffCode})` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-white" />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#fbfbfd]">
                    {["#", "Lead", "Interest", "Status", "Owner", "Last activity"].map(
                      (h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap border-b border-line px-3 py-2.5 text-left text-xs font-semibold text-mut"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {leads.length ? (
                    leads.map((l, i) => (
                      <tr
                        key={l._id}
                        onClick={() => openLead(l._id)}
                        className="cursor-pointer border-b border-[#f1f0f6] transition hover:bg-[#faf7ff]"
                      >
                        <td className="px-3 py-2.5 text-[12.5px] font-semibold text-mut">
                          {(page - 1) * pageSize + i + 1}
                        </td>
                        <td className="px-3 py-2.5">
                          {l.name}
                          <small className="block text-[11.5px] text-mut">
                            {l.mobile} · {l.city || l.state || "—"}
                          </small>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${categoryMeta(l.interestCategory).cls}`}>
                            {categoryMeta(l.interestCategory).label}
                          </span>
                          {l.interest && (
                            <small className="block text-[11.5px] text-mut">{l.interest}</small>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${statusMeta(l.status).cls}`}>
                            {statusMeta(l.status).label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {l.assignedTo ? (
                            <span className="inline-flex items-center gap-2 text-[13px]">
                              <span className="grid h-6 w-6 place-items-center rounded-full bg-primary-soft text-[10.5px] font-bold text-primary">
                                {initials(l.assignedTo.name)}
                              </span>
                              {l.assignedTo.name}
                            </span>
                          ) : (
                            <span className="text-[13px] text-red-600">Unassigned</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-[13px]">{timeAgo(l.updatedAt)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6">
                        <div className="py-8 text-center text-[13px] text-mut">
                          No leads match these filters.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
            <p className="text-xs text-mut">
              {leads.length
                ? `Showing ${(page - 1) * pageSize + 1}-${(page - 1) * pageSize + leads.length} of ${total} leads`
                : "No leads to show"}
            </p>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-mut">
                Rows
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    resetPaging();
                  }}
                  className="rounded-lg border border-line bg-white px-2 py-1 text-[12.5px] focus:border-primary focus:outline-none"
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>

                {pageNumbers.map((n) => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={`h-[30px] min-w-[30px] rounded-lg px-2 text-[12.5px] font-semibold transition ${
                      n === page
                        ? "bg-primary text-white"
                        : "border border-line bg-white text-mut hover:text-primary"
                    }`}
                  >
                    {n}
                  </button>
                ))}

                <button
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                  className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <p className="mt-2.5 text-xs text-mut">
        {isAdmin
          ? "Click any row to open the lead and (re)assign it to a relationship manager."
          : "Click any row to view your lead details."}
      </p>

      <LeadDrawer
        lead={open}
        managers={managers}
        isAdmin={isAdmin}
        onClose={() => setOpen(null)}
        onUpdated={(updated) => {
          setLeads((prev) => prev.map((l) => (l._id === updated._id ? updated : l)));
          setOpen(updated);
        }}
      />
    </div>
  );
}
