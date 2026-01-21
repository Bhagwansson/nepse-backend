const express = require("express");
const router = express.Router();
const {
  getAnalysis,
  getTopPicks,
} = require("../controllers/analysisController");
const { optionalAuth } = require("../middleware/optionalAuth");

// IMPORTANT: Put specific routes (like 'top-picks') BEFORE dynamic routes (like ':symbol')
// If you swap these, 'top-picks' will be treated as a stock symbol!

router.get("/top-picks", optionalAuth, getTopPicks);
router.get("/:symbol", optionalAuth, getAnalysis);

module.exports = router;
