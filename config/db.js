const mongoose = require("mongoose");
// FIX: Load the secret variables directly here just in case
require("dotenv").config();

const connectDB = async () => {
  try {
    // Debugging: Print to console so we KNOW if it found the URI
    // console.log("Mongo URI:", process.env.MONGO_URI);

    const conn = await mongoose.connect(process.env.MONGO_URI, {
      family: 4, // Force IPv4
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);

    // Helpful hint if the URI is missing
    if (error.message.includes("undefined")) {
      console.error("💡 HINT: Check your .env file. Is MONGO_URI defined?");
    }

    process.exit(1);
  }
};

module.exports = connectDB;
