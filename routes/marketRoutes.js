// routes/marketRoutes.js
const express = require("express");
const router = express.Router();
const { getLiveMarket } = require("../controllers/marketController");

// REMOVE 'protect' middleware. Make it public.
router.get("/live", getLiveMarket);

module.exports = router;
