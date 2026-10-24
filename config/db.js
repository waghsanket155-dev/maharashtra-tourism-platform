const dns = require("dns");
// Ensure SRV records can be resolved reliably across all network environments
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const mongoose = require("mongoose");
const { seedSafetyZones } = require("../init/safetyZones.js");

const MONGO_URI = process.env.MONGO_URI || process.env.cloude_mongodb || "mongodb://127.0.0.1:27017/tourist";

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    
    // Safe, sanitized connection logging without exposing credentials
    const isAtlas = MONGO_URI.includes("mongodb.net") || MONGO_URI.startsWith("mongodb+srv://");
    if (isAtlas) {
      console.log("data connected (MongoDB Atlas: tourist)");
    } else {
      console.log("data connected (Local MongoDB: tourist)");
    }

    await seedSafetyZones().catch(err => console.error("SafetyZone seed error:", err));
  } catch (err) {
    console.error("Database connection error:", err.message);
    throw err;
  }
}

module.exports = connectDB;
