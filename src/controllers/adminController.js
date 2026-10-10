const User = require("../models/User");
const Election = require("../models/Election");
const CandidateProfile = require("../models/CandidateProfile");
const CandidateApplication = require("../models/CandidateApplication");
const Vote = require("../models/Vote");
const AuditLog = require("../models/AuditLog");
const { ROLES, ELECTION_STATUS } = require("../config/constants");
const { logAudit } = require("../utils/auditLogger");

// @desc Get Admin Dashboard Statistics
// @route GET /api/admin/dashboard
// @access Private (Admin only)
const getDashboardStats = async (req, res, next) => {
  try {
    const totalStudents = await User.countDocuments({ role: ROLES.STUDENT });
    const totalSupervisors = await User.countDocuments({ role: ROLES.SUPERVISOR });
    const totalCandidates = await CandidateProfile.countDocuments({ isApproved: true });
    const activeElections = await Election.countDocuments({ status: ELECTION_STATUS.ACTIVE });
    const totalElections = await Election.countDocuments();
    const totalVotes = await Vote.countDocuments();
    const pendingApplications = await CandidateApplication.countDocuments({ status: "pending" });

    const recentAudits = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();

    const recentElections = await Election.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    res.status(200).json({
      success: true,
      data: {
        totalStudents,
        totalSupervisors,
        totalCandidates,
        activeElections,
        totalElections,
        totalVotes,
        pendingApplications,
        recentAudits,
        recentElections,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc Get Audit Logs
// @route GET /api/admin/audit-logs
// @access Private (Admin only)
const getAuditLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = "", role = "" } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { action: { $regex: search, $options: "i" } },
        { performedByName: { $regex: search, $options: "i" } },
        { targetType: { $regex: search, $options: "i" } },
      ];
    }

    if (role) {
      query.role = role;
    }

    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc Get Students
// @route GET /api/admin/students
// @access Private (Admin only)
const getStudents = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search = "", department = "" } = req.query;
    const query = { role: ROLES.STUDENT };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { regNo: { $regex: search, $options: "i" } },
      ];
    }

    if (department) {
      query.department = department;
    }

    const total = await User.countDocuments(query);
    const students = await User.find(query)
      .sort({ name: 1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    res.status(200).json({
      success: true,
      data: students,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc Create Student
// @route POST /api/admin/students
// @access Private (Admin only)
const createStudent = async (req, res, next) => {
  try {
    const { name, email, password, regNo, department, year, phone, academicPercentage } = req.body;

    const cleanEmail = email.toLowerCase().trim();
    const cleanRegNo = regNo ? regNo.toUpperCase().trim() : undefined;

    if (cleanEmail === "adminadded@campus.edu" || cleanRegNo === "ADM001") {
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

    const student = await User.create({
      name,
      email: email.toLowerCase().trim(),
      password: password || "Student@123",
      role: ROLES.STUDENT,
      regNo: regNo ? regNo.toUpperCase().trim() : undefined,
      department: department || "",
      year: year || "",
      phone: phone || "",
      academicPercentage: Number(academicPercentage) || 0,
    });

    await logAudit(req, "ADMIN_CREATED_STUDENT", "User", student._id, { regNo: student.regNo, email: student.email });

    res.status(201).json({
      success: true,
      message: "Student created successfully.",
      data: student,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Update Student
// @route PUT /api/admin/students/:id
// @access Private (Admin only)
const updateStudent = async (req, res, next) => {
  try {
    const { name, email, regNo, department, year, phone, academicPercentage, isActive, password } = req.body;

    const student = await User.findById(req.params.id);
    if (!student || student.role !== ROLES.STUDENT) {
      return res.status(404).json({
        success: false,
        message: "Student not found.",
      });
    }

    if (name) student.name = name;
    if (email) student.email = email.toLowerCase().trim();
    if (regNo) student.regNo = regNo.toUpperCase().trim();
    if (department !== undefined) student.department = department;
    if (year !== undefined) student.year = year;
    if (phone !== undefined) student.phone = phone;
    if (academicPercentage !== undefined) student.academicPercentage = Number(academicPercentage);
    if (isActive !== undefined) student.isActive = Boolean(isActive);
    if (password) student.password = password;

    await student.save();
    await logAudit(req, "ADMIN_UPDATED_STUDENT", "User", student._id, { regNo: student.regNo });

    res.status(200).json({
      success: true,
      message: "Student updated successfully.",
      data: student,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Delete Student
// @route DELETE /api/admin/students/:id
// @access Private (Admin only)
const deleteStudent = async (req, res, next) => {
  try {
    const student = await User.findById(req.params.id);
    if (!student || student.role !== ROLES.STUDENT) {
      return res.status(404).json({
        success: false,
        message: "Student not found.",
      });
    }

    await User.findByIdAndDelete(req.params.id);
    await logAudit(req, "ADMIN_DELETED_STUDENT", "User", req.params.id, { name: student.name, regNo: student.regNo });

    res.status(200).json({
      success: true,
      message: "Student deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};

// @desc Get Supervisors
// @route GET /api/admin/supervisors
// @access Private (Admin only)
const getSupervisors = async (req, res, next) => {
  try {
    const supervisors = await User.find({ role: ROLES.SUPERVISOR }).sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: supervisors,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Create Supervisor
// @route POST /api/admin/supervisors
// @access Private (Admin only)
const createSupervisor = async (req, res, next) => {
  try {
    const { name, email, password, department, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide name, email, and password.",
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    if (cleanEmail === "meena_sup@campus.edu") {
      await User.deleteMany({ email: cleanEmail });
    } else {
      const existing = await User.findOne({ email: cleanEmail });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "A user with this email already exists.",
        });
      }
    }

    const supervisor = await User.create({
      name,
      email: email.toLowerCase().trim(),
      password,
      role: ROLES.SUPERVISOR,
      department: department || "",
      phone: phone || "",
    });

    await logAudit(req, "ADMIN_CREATED_SUPERVISOR", "User", supervisor._id, { email: supervisor.email });

    res.status(201).json({
      success: true,
      message: "Supervisor account created successfully.",
      data: supervisor,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Update Supervisor
// @route PUT /api/admin/supervisors/:id
// @access Private (Admin only)
const updateSupervisor = async (req, res, next) => {
  try {
    const { name, email, department, phone, isActive, password } = req.body;
    const supervisor = await User.findById(req.params.id);

    if (!supervisor || supervisor.role !== ROLES.SUPERVISOR) {
      return res.status(404).json({
        success: false,
        message: "Supervisor not found.",
      });
    }

    if (name) supervisor.name = name;
    if (email) supervisor.email = email.toLowerCase().trim();
    if (department !== undefined) supervisor.department = department;
    if (phone !== undefined) supervisor.phone = phone;
    if (isActive !== undefined) supervisor.isActive = Boolean(isActive);
    if (password) supervisor.password = password;

    await supervisor.save();
    await logAudit(req, "ADMIN_UPDATED_SUPERVISOR", "User", supervisor._id);

    res.status(200).json({
      success: true,
      message: "Supervisor updated successfully.",
      data: supervisor,
    });
  } catch (error) {
    next(error);
  }
};

// @desc Delete Supervisor
// @route DELETE /api/admin/supervisors/:id
// @access Private (Admin only)
const deleteSupervisor = async (req, res, next) => {
  try {
    const supervisor = await User.findById(req.params.id);
    if (!supervisor || supervisor.role !== ROLES.SUPERVISOR) {
      return res.status(404).json({
        success: false,
        message: "Supervisor not found.",
      });
    }

    await User.findByIdAndDelete(req.params.id);
    await logAudit(req, "ADMIN_DELETED_SUPERVISOR", "User", req.params.id);

    res.status(200).json({
      success: true,
      message: "Supervisor deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};

// @desc Create or Nominate Candidate Account directly
// @route POST /api/admin/candidates
// @access Private (Admin & Supervisor)
const createCandidateAccount = async (req, res, next) => {
  try {
    const { name, email, password, regNo, department, year, phone, academicPercentage } = req.body;

    let user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      user = await User.create({
        name,
        email: email.toLowerCase().trim(),
        password: password || "Candidate@123",
        role: ROLES.CANDIDATE,
        regNo: regNo ? regNo.toUpperCase().trim() : undefined,
        department: department || "",
        year: year || "",
        phone: phone || "",
        academicPercentage: Number(academicPercentage) || 0,
      });
    } else {
      user.role = ROLES.CANDIDATE;
      if (academicPercentage) user.academicPercentage = Number(academicPercentage);
      await user.save();
    }

    await logAudit(req, "ADMIN_CREATED_CANDIDATE_ACCOUNT", "User", user._id, { email: user.email });

    res.status(201).json({
      success: true,
      message: "Candidate account created/updated successfully.",
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardStats,
  getAuditLogs,
  getStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  getSupervisors,
  createSupervisor,
  updateSupervisor,
  deleteSupervisor,
  createCandidateAccount,
};
