const express = require("express");
const router = express.Router();
const destinationController = require("../controllers/destinationController.js");
const { isLoggedIn, isAdmin } = require("../middleware.js");

// Explore destinations (Public)
router.get("/explore", destinationController.explore);

// Destinations JSON API (Public / Planner use)
router.get("/api/destinations", destinationController.getDestinationsApi);

// Admin Manage Places directory
router.get(["/places", "/admin/places"], isLoggedIn, isAdmin, destinationController.adminPlaces);

// New destination form
router.get(["/admin/new", "/places/new"], isLoggedIn, isAdmin, destinationController.renderNewForm);

// Create destination
router.post(["/places", "/touristplaces"], isLoggedIn, isAdmin, destinationController.createPlace);

// Edit destination form
router.get(["/places/:id/edit", "/admin/places/:id/edit"], isLoggedIn, isAdmin, destinationController.renderEditForm);

// Update destination (both POST and PUT supported)
router.post("/places/:id", isLoggedIn, isAdmin, destinationController.updatePlace);
router.put("/places/:id", isLoggedIn, isAdmin, destinationController.updatePlace);

// Delete destination (both POST /delete and DELETE supported)
router.post("/places/:id/delete", isLoggedIn, isAdmin, destinationController.deletePlace);
router.delete("/places/:id", isLoggedIn, isAdmin, destinationController.deletePlace);

// Destination view and redirects
router.get(["/touristplaces/:id", "/places/:id/view"], destinationController.getDestination);
router.get("/places/:id", destinationController.redirectPlace);

module.exports = router;
