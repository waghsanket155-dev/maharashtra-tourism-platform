const express = require("express");
const router = express.Router();
const tripController = require("../controllers/tripController.js");
const { isLoggedIn } = require("../middleware.js");

// List user's saved trips
router.get(["/my-trips", "/mytrips"], isLoggedIn, tripController.listMyTrips);

// View saved trip itinerary
router.get("/my-trips/:id", isLoggedIn, tripController.getTrip);

// Edit saved trip
router.get("/my-trips/:id/edit", isLoggedIn, tripController.renderEditTrip);
router.put("/my-trips/:id", isLoggedIn, tripController.updateTrip);

// Delete saved trip
router.delete("/my-trips/:id", isLoggedIn, tripController.deleteTrip);

// Smart trip companion & live navigation
router.get("/my-trips/:id/start", isLoggedIn, tripController.startTrip);
router.post("/my-trips/:id/progress", isLoggedIn, tripController.updateProgress);
router.post("/my-trips/:id/complete", isLoggedIn, tripController.completeTrip);

// Live weather forecast API
router.get("/api/trips/weather", isLoggedIn, tripController.getTripWeather);

module.exports = router;
