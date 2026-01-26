const express = require("express");
const router = express.Router();
const {
  getLiveMarket,
  getStockHistory,
  searchStocks,
} = require("../controllers/marketController");
const { getMarketSummary } = require("../controllers/summaryController"); // <--- Import New Controller

router.get("/live", getLiveMarket);
router.get("/history/:symbol", getStockHistory);
router.get("/search", searchStocks);
router.get("/summary", getMarketSummary); // <--- New Route

module.exports = router;
