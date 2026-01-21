const Portfolio = require("../models/Portfolio");
const DailyMarket = require("../models/DailyMarket");

// @desc    Get user portfolio
// @route   GET /api/portfolio
exports.getPortfolio = async (req, res) => {
  try {
    const portfolio = await Portfolio.find({ user: req.user.id });

    // OPTIONAL: Fetch current prices to calculate Profit/Loss
    // We can do this in the frontend or here. For now, let's just return the list.
    res.json(portfolio);
  } catch (error) {
    res.status(500).json({ error: "Server Error" });
  }
};

// @desc    Add stock to portfolio
// @route   POST /api/portfolio
exports.addStock = async (req, res) => {
  try {
    const { symbol, quantity, buyPrice, purchaseDate } = req.body;

    const stock = await Portfolio.create({
      user: req.user.id, // Comes from authMiddleware
      symbol,
      quantity,
      buyPrice,
      purchaseDate,
    });

    res.status(201).json(stock);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to add stock" });
  }
};

// @desc    Delete stock
// @route   DELETE /api/portfolio/:id
exports.deleteStock = async (req, res) => {
  try {
    const stock = await Portfolio.findById(req.params.id);

    if (!stock) {
      return res.status(404).json({ error: "Stock not found" });
    }

    // Make sure user owns the stock
    if (stock.user.toString() !== req.user.id) {
      return res.status(401).json({ error: "User not authorized" });
    }

    await stock.deleteOne();
    res.json({ id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "Server Error" });
  }
};
