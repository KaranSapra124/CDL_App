import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { statusMeta, STATUS_META } from "../lib/status";
import { timeAgo, initials } from "../lib/format";
import LeadDrawer from "../components/LeadDrawer";
import { getAuth } from "../lib/auth";

export default function Leads() {
  const { user } = getAuth();
  const isAdmin = user?.role === "admin";
  const [leads, setLeads] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    apiFetch("/leads")
      .then((res) => setLeads(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    if (isAdmin) {
      apiFetch("/users/staff")
        .then((res) => setManagers(res.data))
        .catch(() => {});
    }
  }, [load, isAdmin]);

  const filtered = leads
    .filter(
      (l) =>
        (!status || l.status === status) &&
        (!owner || l.assignedTo?._id === owner) &&
        (!q ||
          `${l.name} ${l.phone} ${l._id}`.toLowerCase().includes(q.toLowerCase()))
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const openLead = (id) => setOpen(leads.find((l) => l._id === id) || null);

  const selectCls =
    "rounded-lg border border-line bg-white px-2.5 py-2 text-[13px] focus:border-primary focus:outline-none";

  return (
    <div className="mx-auto max-w-[1500px]">
      <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
      <p className="mb-5 mt-0.5 text-[13px] text-mut">
        {isAdmin
          ? "Every lead has exactly one owner. Only an admin can change it."
          : "Showing only the leads assigned to you."}
      </p>

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <input
          type="text"
          placeholder="Search name, phone or ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`w-[230px] ${selectCls}`}
        />
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All stages</option>
          {Object.entries(STATUS_META).map(([key, m]) => (
            <option key={key} value={key}>
              {m.label}
            </option>
          ))}
        </select>
        {isAdmin && (
          <select className={selectCls} value={owner} onChange={(e) => setOwner(e.target.value)}>
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
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#fbfbfd]">
                  {["Lead", "Stage", "Owner", "Last activity", ""].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap border-b border-line px-3 py-2.5 text-left text-xs font-semibold text-mut"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length ? (
                  filtered.map((l) => (
                    <tr
                      key={l._id}
                      onClick={() => openLead(l._id)}
                      className="cursor-pointer border-b border-[#f1f0f6] transition hover:bg-[#faf7ff]"
                    >
                      <td className="px-3 py-2.5">
                        {l.name}
                        <small className="block text-[11.5px] text-mut">
                          {l.phone} · {l.source || "web"}
                        </small>
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
                      <td className="px-3 py-2.5">
                        {l.status === "converted" && (
                          <b className="text-[13px] text-emerald-700">Converted</b>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5">
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
      )}

      <p className="mt-2.5 text-xs text-mut">
        {isAdmin
          ? "Click any row to open the lead and (re)assign it to a business manager."
          : "Click any row to view your lead details."}
      </p>

      <LeadDrawer
        lead={open}
        managers={managers}
        isAdmin={isAdmin}
        onClose={() => setOpen(null)}
        onUpdated={() => load()}
      />
    </div>
  );
}
