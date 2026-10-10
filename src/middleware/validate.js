const validateRegistration = (req, res, next) => {
  const { name, email, password, regNo, department, year, phone, academicPercentage } = req.body;

  if (!name || !email || !password || !regNo || !department || !year) {
    return res.status(400).json({
      success: false,
      message: "Please provide all required fields: name, email, password, regNo, department, year.",
    });
  }

  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters long.",
    });
  }

  const emailRegex = /^\S+@\S+\.\S+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid email address.",
    });
  }

  if (academicPercentage !== undefined && academicPercentage !== "") {
    const num = Number(academicPercentage);
    if (isNaN(num) || num < 0 || num > 100) {
      return res.status(400).json({
        success: false,
        message: "Academic percentage must be a valid number between 0 and 100.",
      });
    }
  }

  next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Please provide both email and password.",
    });
  }

  next();
};

module.exports = {
  validateRegistration,
  validateLogin,
};
