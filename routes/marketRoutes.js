const express = require("express");
const router = express.Router();
const marketController = require("../controllers/marketController");

// Route: /api/market/history/NICA?period=1Y
router.get("/history/:symbol", marketController.getStockHistory);

// Route: /api/market/search?q=SHIVM
router.get("/search", marketController.searchStocks);

module.exports = router;
