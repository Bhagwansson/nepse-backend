require("dotenv").config();
const express = require("express");
require("./config/db")();
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

// --- IMPORTS (Connecting the new folders) ---
const authRoutes = require("./routes/authRoutes");
const marketRoutes = require("./routes/marketRoutes");
const portfolioRoutes = require("./routes/portfolioRoutes");
const analysisRoutes = require("./routes/analysisRoutes");

// Import the Scheduler (The robot that runs at 3:15 PM)
require("./scheduler");

// --- APP CONFIG ---
const app = express();
const server = http.createServer(app); // Create HTTP server for Socket.io
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all connections
    methods: ["GET", "POST"],
  },
});

// --- MIDDLEWARE ---
app.use(helmet()); // Security headers
app.use(cors()); // Allow Frontend to talk to Backend
app.use(express.json()); // Parse JSON bodies
app.use(morgan("dev")); // Log requests to console

// --- DATABASE CONNECTION ---

// --- ROUTES (The Traffic Signs) ---
// This tells the server: "If someone asks for /api/analysis, send them to analysisRoutes.js"
app.use("/api/auth", authRoutes);
app.use("/api/market", marketRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/analysis", analysisRoutes);

// --- REAL-TIME SOCKET ENGINE ⚡ ---
io.on("connection", (socket) => {
  console.log(`🔌 New Client Connected: ${socket.id}`);
  socket.on("disconnect", () => {
    // console.log('User disconnected');
  });
});

// Make 'io' accessible in controllers
app.use((req, res, next) => {
  req.io = io;
  next();
});

// --- BASE ROUTE ---
app.get("/", (req, res) => {
  res.send("🚀 NEPSE Robo-Advisor API is Running (V2)!");
});

// --- START SERVER ---
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📅 Scheduler active: Waiting for market close...`);
});
