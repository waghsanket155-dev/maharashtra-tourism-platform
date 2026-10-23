const place = require("../models/destination.js");
const User = require("../models/user.js");
const Incident = require("../models/incident.js");
const SafetyZone = require("../models/safetyZone.js");
const SavedTrip = require("../models/savetrip.js");

module.exports.dashboard = async (req, res) => {
  try {
    const totalPlaces = await place.countDocuments();
    const totalUsers = await User.countDocuments();
    const totalIncidents = await Incident.countDocuments();
    const totalSafetyZones = await SafetyZone.countDocuments();
    const pendingSafetyZones = await SafetyZone.countDocuments({ verificationStatus: "pending" });
    const totalBookings = await SavedTrip.countDocuments();

    res.render("admin/dashboard.ejs", {
      totalPlaces,
      totalUsers,
      totalBookings,
      totalIncidents,
      totalSafetyZones,
      pendingSafetyZones
    });
  } catch (err) {
    console.error("ADMIN DASHBOARD ERROR:", err);
    req.flash("error", "Unable to load admin dashboard.");
    res.redirect("/");
  }
};
