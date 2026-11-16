import User from "../models/User.js";
import jwt from "jsonwebtoken";

// @desc   Login (admin and staff)
// @route  POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required" });
    }
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    if (!user.isActive) {
      return res
        .status(403)
        .json({ success: false, message: "Account is deactivated" });
    }

    if (!user.password) {
      return res.status(401).json({
        success: false,
        message: "Password is not set for this account",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password" });
    }

    if (user.role !== "admin" && !user.subRole) {
      return res.status(403).json({
        success: false,
        message: "Access denied. No staff role assigned to this account.",
      });
    }

    await User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() });

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user?.role && user?.subRole ? "" : "admin",
        subRole: user.subRole || "",
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
    );

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          subRole: user.subRole,
          staffCode: user.staffCode,
        },
        token,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
