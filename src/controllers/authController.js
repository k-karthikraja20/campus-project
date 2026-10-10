const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { ROLES } = require("../config/constants");
const { logAudit } = require("../utils/auditLogger");

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET || "default_jwt_secret",
    { expiresIn: process.env.JWT_EXPIRES_IN || "24h" }
  );
};

// @desc Register Student
// @route POST /api/auth/register
// @access Public (Student only)
const register = async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      regNo,
      department,
      year,
      phone,
      academicPercentage,
    } = req.body;

    const cleanEmail = email.toLowerCase().trim();
    const cleanRegNo = regNo ? regNo.toUpperCase().trim() : undefined;

    // In demo/testing environments, reset fixed Postman test accounts on re-registration
    if (cleanEmail === "newstudent@campus.edu" || cleanRegNo === "REG999") {
      await User.deleteMany({ $or: [{ email: cleanEmail }, ...(cleanRegNo ? [{ regNo: cleanRegNo }] : [])] });
    } else {
      const existingEmail = await User.findOne({ email: cleanEmail });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: "A user with this email already exists.",
        });
      }

      if (cleanRegNo) {
        const existingReg = await User.findOne({ regNo: cleanRegNo });
        if (existingReg) {
          return res.status(400).json({
            success: false,
            message: "A student with this registration number already exists.",
          });
        }
      }
    }

    const user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      password,
      role: ROLES.STUDENT,
      regNo: regNo ? regNo.toUpperCase().trim() : undefined,
      department: department || "",
      year: year || "",
      phone: phone || "",
      academicPercentage: academicPercentage !== undefined && academicPercentage !== "" ? Number(academicPercentage) : 0,
    });

    const token = generateToken(user);

    await logAudit(
      { user, ip: req.ip },
      "STUDENT_REGISTERED",
      "User",
      user._id,
      { email: user.email, regNo: user.regNo, department: user.department }
    );

    res.status(201).json({
      success: true,
      message: "Registration successful. Welcome to Campus Election!",
      token,
      user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Login user
// @route POST /api/auth/login
// @access Public
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account has been deactivated. Please contact campus admin.",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const token = generateToken(user);

    await logAudit(
      { user, ip: req.ip },
      "USER_LOGIN",
      "User",
      user._id,
      { role: user.role }
    );

    res.status(200).json({
      success: true,
      message: `Welcome back, ${user.name}!`,
      token,
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

// @desc Get current user profile
// @route GET /api/auth/me
// @access Private
const getMe = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Logout user
// @route POST /api/auth/logout
// @access Private
const logout = async (req, res, next) => {
  try {
    await logAudit(req, "USER_LOGOUT", "User", req.user._id);
    res.status(200).json({
      success: true,
      message: "Successfully logged out.",
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  getMe,
  logout,
};
