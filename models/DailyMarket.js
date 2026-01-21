const mongoose = require("mongoose");

const stockSchema = new mongoose.Schema({
  date: { type: String, required: true }, // Format: "YYYY-MM-DD"
  stocks: [
    {
      symbol: String,
      name: String,
      price: Number,
      change: Number,
      quantity: Number, // Optional, for volume
    },
  ],
});

// We add an index on 'date' to make sorting and searching super fast
stockSchema.index({ date: -1 });

module.exports = mongoose.model("DailyMarket", stockSchema);
