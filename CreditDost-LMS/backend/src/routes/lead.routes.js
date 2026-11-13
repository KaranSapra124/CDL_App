import { Router } from "express";
import { protect, adminOnly } from "../middleware/auth.js";
import {
  getLeads,
  getLead,
  createLead,
  assignLead,
  updateLead,
  deleteLead,
} from "../controllers/lead.controller.js";

const router = Router();

router.use(protect);

router.route("/").get(getLeads).post(adminOnly, createLead);
router.route("/:id").get(getLead).put(adminOnly, updateLead).delete(adminOnly, deleteLead);
router.route("/:id/assign").put(adminOnly, assignLead);

export default router;
