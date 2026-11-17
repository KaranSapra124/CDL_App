import { Router } from "express";
import User from "../models/User.js";
import { protect } from "../middleware/auth.js";
import { RM_POOL_FILTER } from "../utils/roundRobin.js";

const router = Router();

router.use(protect);

// @desc   Get assignable relationship managers (RM pool) for lead ownership
// @route  GET /api/users/staff
router.get("/staff", async (req, res) => {
  try {
    const managers = await User.find({ ...RM_POOL_FILTER })
      .select("name email staffCode subRole role")
      .sort({ staffCode: 1 });
    res.status(200).json({ success: true, count: managers.length, data: managers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
