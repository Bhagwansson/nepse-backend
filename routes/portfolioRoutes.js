const express = require("express");
const router = express.Router();
const {
  getPortfolio,
  addStock,
  deleteStock,
} = require("../controllers/portfolioController");
const { protect } = require("../middleware/authMiddleware");

// All routes here are protected
router.use(protect);

router.route("/").get(getPortfolio).post(addStock);

router.route("/:id").delete(deleteStock);

module.exports = router;
