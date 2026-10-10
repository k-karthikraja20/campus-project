const AuditLog = require("../models/AuditLog");

const logAudit = async (req, action, targetType = "", targetId = "", details = {}) => {
  try {
    const performedBy = req.user ? req.user._id : null;
    const performedByName = req.user ? req.user.name : "System / Anonymous";
    const role = req.user ? req.user.role : "system";
    const ipAddress = req.ip || req.connection?.remoteAddress || "";

    await AuditLog.create({
      action,
      performedBy,
      performedByName,
      role,
      targetType,
      targetId: targetId ? targetId.toString() : "",
      details,
      ipAddress,
    });
  } catch (error) {
    console.error(`[Audit Log Failed]: ${error.message}`);
  }
};

module.exports = { logAudit };
