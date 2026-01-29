const express = require("express");
const router = express.Router();
const {
  getLiveMarket,
  getStockHistory,
  searchStocks,
} = require("../controllers/marketController");
const { getMarketSummary } = require("../controllers/summaryController"); // <--- Import New Controller
const {
  seedRealHistory,
  updateLiveMarket,
} = require("../controllers/realDataController");

router.get("/live", getLiveMarket);
router.get("/history/:symbol", getStockHistory);
router.get("/search", searchStocks);
router.get("/summary", getMarketSummary); // <--- New Route
// REAL DATA ROUTES
router.get("/real-seed", seedRealHistory); // Run this ONCE to fill history
router.get("/force-update", updateLiveMarket); // Run this to get TODAY's price

module.exports = router;
