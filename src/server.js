require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { connectDB } = require("./config/db");
const errorHandler = require("./middleware/errorHandler");

// Route imports
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const electionRoutes = require("./routes/electionRoutes");
const candidateApplicationRoutes = require("./routes/candidateApplicationRoutes");
const candidateRoutes = require("./routes/candidateRoutes");
const voteRoutes = require("./routes/voteRoutes");
const resultRoutes = require("./routes/resultRoutes");
const supervisorRoutes = require("./routes/supervisorRoutes");

const app = express();

// Security and utility middleware
app.use(helmet());
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(",").map((u) => u.trim()) : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// Healthcheck
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/elections", electionRoutes);
app.use("/api/candidate-applications", candidateApplicationRoutes);
app.use("/api/candidates", candidateRoutes);
app.use("/api/candidate", candidateRoutes);
app.use("/api/votes", voteRoutes);
app.use("/api/results", resultRoutes);
app.use("/api/supervisor", supervisorRoutes);

// 404 Route handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== "test") {
  connectDB().then(() => {
    const server = app.listen(PORT, () => {
      console.log(`[Server] Campus Election Voting System API running on port ${PORT}`);
      console.log(`[Server] Base URL: http://localhost:${PORT}/api`);
    });

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`\n[Server Warning] Port ${PORT} is already in use by another running process.`);
        console.error(`The backend is already running on http://localhost:${PORT}/api.`);
        console.error(`If you want to free port ${PORT} and restart, run: npm run clean-port\n`);
      } else {
        console.error("[Server Error]", error);
      }
    });
  });
}

module.exports = app;
