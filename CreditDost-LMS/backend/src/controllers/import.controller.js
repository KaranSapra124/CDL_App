import SheetLead from "../models/SheetLead.js";
import XLSX from "xlsx";
import { assignLeadsRoundRobin } from "../utils/roundRobin.js";

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

function normalizeMobile(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
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
    let invalid = 0;

    rows.forEach((row, i) => {
      const rec = {};
      for (const [key, field] of Object.entries(mapped)) {
        const v = row[key];
        if (field === "date") rec.date = parseDate(v);
        else if (field === "mobile") rec.mobile = normalizeMobile(v);
        else rec[field] = String(v ?? "").trim();
      }

      if (!rec.name || !rec.mobile || rec.mobile.length < 10) {
        invalid++;
        if (errors.length < 10) {
          errors.push(`Row ${i + 2}: missing or invalid name/mobile`);
        }
        return;
      }

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
              ...(rec.date ? { date: rec.date } : {}),
            },
            $setOnInsert: {
              status: "New Lead",
              assignedTo: null,
              assignedAt: null,
            },
          },
          upsert: true,
        },
      });
    });

    const result = ops.length ? await SheetLead.bulkWrite(ops) : null;

    const upsertedIds = result?.upsertedIds ?? {};
    const newLeadIds = Object.keys(upsertedIds)
      .map(Number)
      .sort((a, b) => a - b)
      .map((i) => upsertedIds[String(i)]);

    const { assignments, skipped: unassignedSkipped } =
      await assignLeadsRoundRobin(newLeadIds);

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
