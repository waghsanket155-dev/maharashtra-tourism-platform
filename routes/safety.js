const express = require("express");
const router = express.Router();
const safetyController = require("../controllers/safetyController.js");
const { isLoggedIn } = require("../middleware.js");

// Tourist Safety Dashboard
router.get("/safety", isLoggedIn, safetyController.renderSafetyDashboard);

// Tourist ID redirect to safety
router.get("/tourist-id", isLoggedIn, (req, res) => {
  res.redirect("/safety");
});

// GeoFence active zones API
router.get("/api/safety/geofences", isLoggedIn, safetyController.getGeofencesApi);

// SOS Incident submission
router.post("/incidents", isLoggedIn, safetyController.submitIncident);

// User's incident history & details
router.get("/my-incidents", isLoggedIn, safetyController.listMyIncidents);
router.get("/my-incidents/:id", isLoggedIn, safetyController.getIncidentDetails);

module.exports = router;
