import { Router } from "express";
import User from "../models/User.js";
import { protect } from "../middleware/auth.js";

const router = Router();

router.use(protect);

// @desc   Get all staff members having a subRole (for lead assignment)
// @route  GET /api/users/staff
router.get("/staff", async (req, res) => {
  try {
    const managers = await User.find({
      subRole: { $exists: true, $nin: [null, "franchise", "super_admin", ""] },
      isActive: true,
    })
      .select("name email staffCode subRole role")
      .sort({ name: 1 });
    res.status(200).json({ success: true, count: managers.length, data: managers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
