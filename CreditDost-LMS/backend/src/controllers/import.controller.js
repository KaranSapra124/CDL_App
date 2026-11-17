import SheetLead from "../models/SheetLead.js";
import XLSX from "xlsx";
import { assignLeadsRoundRobin, getRoundRobinStaff } from "../utils/roundRobin.js";
import { normalizeMobile } from "../utils/mobile.js";

const HEADER_MAP = {
  date: "date",
  source: "source",
  name: "name",
  email: "email",
  mobile: "mobile",
  phone: "mobile",
  number: "mobile",
  "phone number": "mobile",
  "mobile number": "mobile",
  whatsapp: "whatsappNumber",
  "whatsapp number": "whatsappNumber",
  "whatsapp no": "whatsappNumber",
  "whatsapp no.": "whatsappNumber",
  "alt number": "whatsappNumber",
  city: "city",
  state: "state",
  "group joined": "groupJoined",
  groupjoined: "groupJoined",
  remarks: "remarks",
  remark: "remarks",
  notes: "remarks",
  rm: "rmName",
  "rm name": "rmName",
  owner: "rmName",
  "assigned to": "rmName",
  "assigned rm": "rmName",
  "relationship manager": "rmName",
};

function mapHeader(key) {
  const k = String(key).trim().toLowerCase();
  if (k in HEADER_MAP) return HEADER_MAP[k];
  if (k === "" || k.startsWith("__empty")) return "whatsappNumber";
  return null;
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value)) return value;

  const dm = String(value).match(/^Date\((\d+),(\d+),(\d+)/);
  if (dm) return new Date(Number(dm[1]), Number(dm[2]), Number(dm[3]));

  const n = Number(value);
  if (value !== "" && value != null && !Number.isNaN(n)) {
    return new Date(Math.round((n - 25569) * 86400000));
  }

  const d = new Date(value);
  return Number.isNaN(d) ? null : d;
}

// @desc   Import leads from an uploaded xlsx/xls/csv file (admin only)
// @route  POST /api/leads/import
export const importLeads = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const allRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      defval: "",
    });

    if (!allRows.length) {
      return res
        .status(400)
        .json({ success: false, message: "The file has no data rows" });
    }

    const totalRowsInFile = allRows.length;
    const rows = allRows;

    const mapped = {};
    for (const key of Object.keys(rows[0])) {
      const field = mapHeader(key);
      if (field && !Object.values(mapped).includes(field)) mapped[key] = field;
    }

    const mappedFields = Object.values(mapped);
    if (!mappedFields.includes("name") || !mappedFields.includes("mobile")) {
      return res.status(400).json({
        success: false,
        message: 'File must have "Name" and "Mobile" columns',
      });
    }

    const ops = [];
    const errors = [];
    const rmByOp = new Map();
    let invalid = 0;
    const now = new Date();

    const staffPool = await getRoundRobinStaff();
    const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
    const findStaffByName = (input) => {
      const n = norm(input);
      if (!n) return null;
      return (
        staffPool.find((s) => norm(s.name) === n) ||
        staffPool.find((s) => norm(s.staffCode) === n) ||
        staffPool.find((s) => norm(s.name).startsWith(n)) ||
        staffPool.find((s) => norm(s.name).includes(n)) ||
        null
      );
    };

    rows.forEach((row, i) => {
      const rec = {};
      for (const [key, field] of Object.entries(mapped)) {
        const v = row[key];
        if (field === "date") rec.date = parseDate(v);
        else if (field === "mobile") rec.mobile = normalizeMobile(v);
        else if (field === "rmName") rec.rmName = String(v ?? "").trim();
        else rec[field] = String(v ?? "").trim();
      }

      if (!rec.name || !rec.mobile || rec.mobile.length < 10) {
        invalid++;
        if (errors.length < 10) {
          errors.push(`Row ${i + 2}: missing or invalid name/mobile`);
        }
        return;
      }

      const matchedRm = findStaffByName(rec.rmName);

      ops.push({
        updateOne: {
          filter: { mobile: rec.mobile },
          update: {
            $set: {
              name: rec.name,
              email: rec.email,
              source: rec.source,
              whatsappNumber: rec.whatsappNumber,
              city: rec.city,
              state: rec.state,
              groupJoined: rec.groupJoined,
              remarks: rec.remarks,
              lastImportedAt: now,
              ...(rec.date ? { date: rec.date } : {}),
            },
            $inc: { importCount: 1 },
            $setOnInsert: {
              status: "New Lead",
              assignedTo: null,
              assignedAt: null,
            },
          },
          upsert: true,
        },
      });

      rmByOp.set(ops.length - 1, {
        rowNumber: i + 2,
        input: rec.rmName,
        staffId: matchedRm?._id ?? null,
      });
    });

    const result = ops.length ? await SheetLead.bulkWrite(ops) : null;

    const upsertedIds = result?.upsertedIds ?? {};
    const upsertedEntries = Object.keys(upsertedIds)
      .map(Number)
      .sort((a, b) => a - b)
      .map((i) => [i, upsertedIds[String(i)]]);

    const explicitAssignments = [];
    const roundRobinIds = [];
    for (const [opIndex, leadId] of upsertedEntries) {
      const info = rmByOp.get(opIndex);
      if (info?.staffId) {
        explicitAssignments.push({ leadId, staffId: info.staffId });
      } else {
        if (info?.input && errors.length < 10) {
          errors.push(
            `Row ${info.rowNumber}: RM name "${info.input}" not found, assigned via round robin`
          );
        }
        roundRobinIds.push(leadId);
      }
    }

    let assignedBySheet = 0;
    if (explicitAssignments.length) {
      const assignedAt = new Date();
      await SheetLead.bulkWrite(
        explicitAssignments.map(({ leadId, staffId }) => ({
          updateOne: {
            filter: { _id: leadId },
            update: { $set: { assignedTo: staffId, assignedAt } },
          },
        }))
      );
      assignedBySheet = explicitAssignments.length;
    }

    const { assignments, skipped: unassignedSkipped } =
      await assignLeadsRoundRobin(roundRobinIds);

    res.status(200).json({
      success: true,
      data: {
        fileName: req.file.originalname,
        totalRowsInFile,
        processedRows: rows.length,
        newLeads: result ? result.upsertedCount : 0,
        updatedExisting: result ? result.modifiedCount : 0,
        invalidRows: invalid,
        errors,
        assignedBySheet,
        autoAssigned: assignments.size,
        unassignedSkipped,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc   Download a sample xlsx showing the expected import format (admin only)
// @route  GET /api/leads/import/sample
export const downloadImportSample = async (req, res) => {
  try {
    const headers = [
      "Date",
      "Source",
      "Name",
      "Email",
      "Mobile",
      "WhatsApp Number",
      "City",
      "State",
      "Group Joined",
      "Remarks",
      "RM Name",
    ];
    const rows = [
      [
        "2026-11-17",
        "Facebook",
        "Rahul Sharma",
        "rahul.sharma@example.com",
        "9876543210",
        "9876543210",
        "Pune",
        "Maharashtra",
        "Yes",
        "Interested in credit score repair",
        "RM-4",
      ],
      [
        "2026-11-17",
        "Google",
        "Priya Singh",
        "priya.singh@example.com",
        "9123456780",
        "9123456780",
        "Indore",
        "Madhya Pradesh",
        "No",
        "Requested a call back",
        "",
      ],
    ];

    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    sheet["!cols"] = [
      { wch: 12 },
      { wch: 12 },
      { wch: 20 },
      { wch: 28 },
      { wch: 14 },
      { wch: 16 },
      { wch: 12 },
      { wch: 16 },
      { wch: 14 },
      { wch: 34 },
      { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Leads");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="leads-sample.xlsx"'
    );
    res.send(buf);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc   List imported leads (staff see only their own)
// @route  GET /api/leads/imported
export const getImportedLeads = async (req, res) => {  try {
    const filter = req.user.role === "admin" ? {} : { assignedTo: req.user._id };
    const leads = await SheetLead.find(filter)
      .populate("assignedTo", "name staffCode")
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit) || 100);
    res.status(200).json({ success: true, count: leads.length, data: leads });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
