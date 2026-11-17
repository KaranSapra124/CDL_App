import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, apiUpload, apiDownload } from "../lib/api";
import { statusMeta } from "../lib/status";
import { initials } from "../lib/format";
import { toast } from "../lib/toast";

export default function ImportLeads() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef(null);

  const load = useCallback(() => {
    apiFetch("/leads/imported?limit=50")
      .then((res) => setLeads(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pickFile = (f) => {
    if (!f) return;
    const ok = [".xlsx", ".xls", ".csv"].some((ext) =>
      f.name.toLowerCase().endsWith(ext)
    );
    if (!ok) {
      toast("Only .xlsx, .xls or .csv files are allowed");
      return;
    }
    setFile(f);
    setResult(null);
  };

  const handleImport = async () => {
    if (!file) {
      toast("Choose an xlsx file first");
      return;
    }
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiUpload("/leads/import", fd);
      setResult(res.data);
      toast(`${res.data.newLeads} new leads imported`);
      load();
    } catch (err) {
      toast(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadSample = async () => {
    setDownloading(true);
    try {
      await apiDownload("/leads/import/sample", "leads-sample.xlsx");
      toast("Sample file downloaded");
    } catch (err) {
      toast(err.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px]">
      <h1 className="text-2xl font-bold tracking-tight">Import Leads</h1>
      <p className="mb-5 mt-0.5 text-[13px] text-mut">
        Upload a leads xlsx file. All rows are imported and new leads are
        auto-assigned to relationship managers in round-robin order.
        Duplicates are matched by mobile number, so re-importing is always
        safe.
      </p>

      <div className="grid gap-3.5 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border border-line bg-white p-4 px-[18px]">
          <h2 className="mb-3 text-base font-semibold">Upload leads file</h2>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => inputRef.current?.click()}
            className={`grid cursor-pointer place-items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
              dragging
                ? "border-primary bg-primary-soft"
                : "border-line hover:border-primary hover:bg-[#faf7ff]"
            }`}
          >
            <div className="text-3xl">📄</div>
            {file ? (
              <>
                <p className="mt-2 text-[13px] font-semibold">{file.name}</p>
                <p className="text-[11.5px] text-mut">
                  {(file.size / 1024).toFixed(0)} KB · click to change
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-[13px] font-semibold">
                  Drag &amp; drop your .xlsx here, or click to browse
                </p>
                <p className="text-[11.5px] text-mut">.xlsx, .xls or .csv up to 15 MB</p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleImport}
              disabled={importing || !file}
              className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {importing ? "Importing..." : "Import leads"}
            </button>
            <button
              onClick={handleDownloadSample}
              disabled={downloading}
              className="rounded-lg border border-line bg-white px-4 py-2 text-[13px] font-semibold text-mut transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading ? "Downloading..." : "Download sample file"}
            </button>
          </div>
          <p className="mt-3 text-xs text-mut">
            The file must contain <b>Name</b> and <b>Mobile</b> columns.
            Recognised columns: Date, Source, Name, Email, Mobile, WhatsApp
            number, City, State, Group Joined, Remarks, RM Name. Rows with an{" "}
            <b>RM Name</b> go to that manager (name or staff code like RM-4);
            blank rows are auto-assigned round robin.
          </p>
        </div>

        <div className="rounded-xl border border-line bg-white p-4 px-[18px]">
          <h2 className="mb-3 text-base font-semibold">Last import</h2>
          {result ? (
            <div className="grid gap-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-mut">File</span>
                <b className="max-w-[220px] truncate">{result.fileName}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-mut">Rows in file</span>
                <b>{result.totalRowsInFile}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-mut">Rows processed</span>
                <b>{result.processedRows}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-mut">New leads</span>
                <b className="text-emerald-700">{result.newLeads}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-mut">Assigned by sheet RM Name</span>
                <b>{result.assignedBySheet}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-mut">Auto-assigned (round robin)</span>
                <b>{result.autoAssigned}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-mut">Existing updated</span>
                <b>{result.updatedExisting}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-mut">Invalid rows skipped</span>
                <b className={result.invalidRows ? "text-red-600" : ""}>
                  {result.invalidRows}
                </b>
              </div>
              {result.errors?.length > 0 && (
                <div className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                  {result.errors.map((e) => (
                    <div key={e}>{e}</div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="py-6 text-center text-[13px] text-mut">
              No import run yet in this session.
            </div>
          )}
        </div>
      </div>

      <h2 className="mb-3 mt-6 text-base font-semibold">Imported leads (latest 50)</h2>
      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-white" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#fbfbfd]">
                  {["Lead", "Location", "Source", "Date", "Status", "Owner"].map((h) => (
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
                {leads.length ? (
                  leads.map((l) => (
                    <tr
                      key={l._id}
                      className="border-b border-[#f1f0f6] transition hover:bg-[#faf7ff]"
                    >
                      <td className="px-3 py-2.5">
                        {l.name}
                        <small className="block text-[11.5px] text-mut">{l.mobile}</small>
                      </td>
                      <td className="px-3 py-2.5 text-[13px]">
                        {[l.city, l.state].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-[13px]">{l.source || "—"}</td>
                      <td className="px-3 py-2.5 text-[13px]">
                        {l.date ? new Date(l.date).toLocaleDateString("en-IN") : "—"}
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
                          <span className="text-[13px] text-mut">Unassigned</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6">
                      <div className="py-8 text-center text-[13px] text-mut">
                        Nothing imported yet.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
