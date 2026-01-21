require('dotenv').config();
const mongoose = require('mongoose');

const resetDB = async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("🔥 Connected. Deleting all market data...");
    await mongoose.connection.collection('dailymarkets').drop();
    console.log("✅ Database Wiped Clean.");
    process.exit();
};

resetDB();