const express = require("express");
const router = express.Router();
const analysisController = require("../controllers/analysisController");

// --- 1. SPECIFIC ROUTES FIRST ---
// This MUST be above /:symbol, or "dashboard" will be treated as a stock symbol!
router.get("/dashboard/top", analysisController.getTopPicks);

// --- 2. DYNAMIC ROUTES SECOND ---
router.get("/:symbol", analysisController.getAnalysis);

module.exports = router;
