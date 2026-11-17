import { Router } from "express";
import { protect, adminOnly } from "../middleware/auth.js";
import upload from "../middleware/upload.js";
import {
  getLeads,
  getLead,
  createLead,
  assignLead,
  updateLead,
  deleteLead,
} from "../controllers/lead.controller.js";
import {
  importLeads,
  getImportedLeads,
  downloadImportSample,
} from "../controllers/import.controller.js";

const router = Router();

router.use(protect);

router.route("/").get(getLeads).post(createLead);
router.post("/import", adminOnly, upload.single("file"), importLeads);
router.get("/import/sample", adminOnly, downloadImportSample);
router.get("/imported", getImportedLeads);
router.route("/:id").get(getLead).put(updateLead).delete(adminOnly, deleteLead);
router.route("/:id/assign").put(adminOnly, assignLead);

router.use((err, req, res, next) => {
  res.status(400).json({ success: false, message: err.message });
});

export default router;
