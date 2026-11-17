import SheetLead from "../models/SheetLead.js";
import User from "../models/User.js";
import { RM_POOL_FILTER } from "../utils/roundRobin.js";

const isAdmin = (user) => user?.role === "admin" && user?.subRole === 'super_admin';

const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// @desc   Get all leads (staff see only their own). Supports server-side
//         pagination + filters via ?page&limit&q&category&status&owner
// @route  GET /api/leads
export const getLeads = async (req, res) => {
  try {
    const filter = {};
    if (!isAdmin(req.user)) {
      filter.assignedTo = req.user._id;
    } else if (req.query.owner) {
      filter.assignedTo = req.query.owner;
    }
    if (req.query.category) filter.interestCategory = req.query.category;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.q?.trim()) {
      const rx = { $regex: escapeRegExp(req.query.q.trim()), $options: "i" };
      const or = [{ name: rx }, { mobile: rx }];
      if (/^[0-9a-f]{24}$/i.test(req.query.q.trim())) {
        or.push({ _id: req.query.q.trim() });
      }
      filter.$or = or;
    }

    const page = Number(req.query.page);
    if (!page) {
      const leads = await SheetLead.find(filter)
        .populate("assignedTo", "name email role staffCode")
        .sort({ createdAt: -1 });
      return res
        .status(200)
        .json({ success: true, count: leads.length, data: leads });
    }

    const limit = Math.min(Number(req.query.limit) || 10, 100);
    const total = await SheetLead.countDocuments(filter);
    const pages = Math.max(1, Math.ceil(total / limit));
    const leads = await SheetLead.find(filter)
      .populate("assignedTo", "name email role staffCode")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json({
      success: true,
      data: leads,
      total,
      page,
      pages,
      count: leads.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc   Get single lead (staff can only view their own)
// @route  GET /api/leads/:id
export const getLead = async (req, res) => {
  try {
    const filter = isAdmin(req.user)
      ? { _id: req.params.id }
      : { _id: req.params.id, assignedTo: req.user._id };

    const lead = await SheetLead.findOne(filter).populate(
      "assignedTo",
      "name email role staffCode"
    );
    if (!lead) {
      return res
        .status(404)
        .json({ success: false, message: "Lead not found" });
    }
    res.status(200).json({ success: true, data: lead });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc   Create lead (admin only)
// @route  POST /api/leads
export const createLead = async (req, res) => {
  try {
    const {
      name,
      email,
      mobile,
      source,
      city,
      state,
      groupJoined,
      remarks,
      interestCategory,
      interest,
    } = req.body;

    const existing = await SheetLead.findOne({ mobile });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "Lead with this mobile already exists" });
    }

    const lead = await SheetLead.create({
      name,
      email,
      mobile,
      source,
      city,
      state,
      groupJoined,
      remarks,
      interestCategory,
      interest,
    });
    res.status(201).json({ success: true, data: lead });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc   Assign lead to a staff member (admin only)
// @route  PUT /api/leads/:id/assign
export const assignLead = async (req, res) => {
  try {
    const { assignedTo } = req.body;

    if (assignedTo) {
      const target = await User.findOne({
        _id: assignedTo,
        ...RM_POOL_FILTER,
      }).select("_id");
      if (!target) {
        return res.status(400).json({
          success: false,
          message:
            "Leads can only be assigned to an active relationship manager with an RM staff code",
        });
      }
    }

    const lead = await SheetLead.findByIdAndUpdate(
      req.params.id,
      { assignedTo, assignedAt: Date.now() },
      { new: true, runValidators: true }
    ).populate("assignedTo", "name email role staffCode");

    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }

    res.status(200).json({ success: true, data: lead });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const CATEGORY_INTERESTS = {
  "Interested In": ["Franchise", "Credit Score Repair"],
  "Follow Up": ["Call Back"],
};

const TERMINAL_STATUSES = ["Closed", "Sale Closed", "Not Interested"];

// @desc   Update lead (staff can edit their own, limited fields; admin full access)
// @route  PUT /api/leads/:id
export const updateLead = async (req, res) => {
  try {
    const baseFields = [
      "interestCategory",
      "interest",
      "status",
      "remarks",
      "nextFollowUp",
    ];
    const adminFields = [
      "name",
      "email",
      "mobile",
      "source",
      "city",
      "state",
      "groupJoined",
      "date",
    ];

    const allowed = isAdmin(req.user) ? [...baseFields, ...adminFields] : baseFields;

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (!Object.keys(updates).length) {
      return res
        .status(400)
        .json({ success: false, message: "No editable fields provided" });
    }

    const category = updates.interestCategory;
    const interest = updates.interest;
    if (
      category &&
      interest &&
      CATEGORY_INTERESTS[category] &&
      !CATEGORY_INTERESTS[category].includes(interest)
    ) {
      return res.status(400).json({
        success: false,
        message: `Interest "${interest}" is not valid for category "${category}"`,
      });
    }

    const filter = isAdmin(req.user)
      ? { _id: req.params.id }
      : { _id: req.params.id, assignedTo: req.user._id };

    const existing = await SheetLead.findOne(filter);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: isAdmin(req.user)
          ? "Lead not found"
          : "Lead not found or not assigned to you",
      });
    }

    const merged = {
      interestCategory: existing.interestCategory,
      interest: existing.interest,
      status: existing.status,
      ...updates,
    };

    if (TERMINAL_STATUSES.includes(merged.status)) {
      updates.nextFollowUp = null;
    } else if (updates.nextFollowUp !== undefined) {
      if (updates.nextFollowUp === null) {
        updates.nextFollowUp = null;
      } else {
        const date = new Date(updates.nextFollowUp);
        if (Number.isNaN(date.getTime())) {
          return res.status(400).json({
            success: false,
            message: "nextFollowUp is not a valid date",
          });
        }
        updates.nextFollowUp = date;
      }
    }

    const lead = await SheetLead.findOneAndUpdate(filter, updates, {
      new: true,
      runValidators: true,
    }).populate("assignedTo", "name email role staffCode");

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: isAdmin(req.user)
          ? "Lead not found"
          : "Lead not found or not assigned to you",
      });
    }

    res.status(200).json({ success: true, data: lead });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// @desc   Delete lead (admin only)
// @route  DELETE /api/leads/:id
export const deleteLead = async (req, res) => {
  try {
    const lead = await SheetLead.findByIdAndDelete(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }
    res.status(200).json({ success: true, message: "Lead deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
