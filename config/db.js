const mongoose = require("mongoose");
const { seedSafetyZones } = require("../init/safetyZones.js");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/tourist";

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("data connected");
    await seedSafetyZones().catch(err => console.error("SafetyZone seed error:", err));
  } catch (err) {
    console.error("Database connection error:", err);
    throw err;
  }
}

module.exports = connectDB;
