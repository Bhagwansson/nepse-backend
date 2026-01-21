// routes/analysisRoutes.js
const express = require("express");
const router = express.Router();
const { getStockAnalysis } = require("../controllers/analysisController");
const { optionalAuth } = require("../middleware/optionalAuth"); // Import new middleware

// Use optionalAuth instead of protect
router.get("/:symbol", optionalAuth, getStockAnalysis);

module.exports = router;
