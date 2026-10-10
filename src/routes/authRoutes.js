const express = require("express");
const router = express.Router();
const { register, login, getMe, logout } = require("../controllers/authController");
const { verifyToken } = require("../middleware/auth");
const { validateRegistration, validateLogin } = require("../middleware/validate");
const { authRateLimiter } = require("../middleware/rateLimiter");

router.post("/register", authRateLimiter, validateRegistration, register);
router.post("/login", authRateLimiter, validateLogin, login);
router.get("/me", verifyToken, getMe);
router.post("/logout", verifyToken, logout);

module.exports = router;
