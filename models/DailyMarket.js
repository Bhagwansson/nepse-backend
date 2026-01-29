const mongoose = require("mongoose");

const DailyMarketSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true,
  },
  nepseIndex: { type: Number }, // <--- ADD THIS FIELD
  stocks: [
    {
      symbol: String,
      name: String,
      price: Number,
      change: Number,
      volume: Number,
    },
  ],
});

module.exports = mongoose.model("DailyMarket", DailyMarketSchema);
