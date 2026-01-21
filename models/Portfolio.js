const mongoose = require("mongoose");

const PortfolioSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
    required: true,
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  buyPrice: {
    type: Number,
    required: true,
  },
  purchaseDate: {
    type: Date,
    default: Date.now,
  },
});

// Prevent duplicate entries for the same stock (Optional: remove if you want multiple entries for same stock)
// PortfolioSchema.index({ user: 1, symbol: 1 }, { unique: true });

module.exports = mongoose.model("Portfolio", PortfolioSchema);
