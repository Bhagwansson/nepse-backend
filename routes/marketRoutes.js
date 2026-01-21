const express = require("express");
const router = express.Router();
const {
  getLiveMarket,
  getStockHistory,
  searchStocks,
} = require("../controllers/marketController");

// Public Routes
router.get("/live", getLiveMarket);
router.get("/history/:symbol", getStockHistory);
router.get("/search", searchStocks);

module.exports = router;
