import Lead from "../models/Lead.js";

const isAdmin = (user) => user?.role === "admin" && !user?.subRole;

// @desc   Get all leads (staff see only their own)
// @route  GET /api/leads
export const getLeads = async (req, res) => {
  
  try {
    const filter = isAdmin(req.user) ? {} : { assignedTo: req.user._id };
  console.log(req.user)
    const leads = await Lead.find(filter)
      .populate("assignedTo", "name email role staffCode")
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: leads.length, data: leads });
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

    const lead = await Lead.findOne(filter).populate(
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
    const { name, email, phone, source, notes } = req.body;

    const existing = await Lead.findOne({ phone });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "Lead with this phone already exists" });
    }

    const lead = await Lead.create({ name, email, phone, source, notes });
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

    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { assignedTo, status: "assigned", assignedAt: Date.now() },
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

// @desc   Update lead (admin only)
// @route  PUT /api/leads/:id
export const updateLead = async (req, res) => {
  try {
    const lead = await Lead.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
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
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }
    res.status(200).json({ success: true, message: "Lead deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
