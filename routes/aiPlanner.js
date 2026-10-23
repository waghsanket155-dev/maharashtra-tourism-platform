const express = require("express");
const router = express.Router();
const aiPlannerController = require("../controllers/aiPlannerController.js");
const { isLoggedIn } = require("../middleware.js");

// AI Planner page
router.get(["/planner", "/ai-planner"], isLoggedIn, aiPlannerController.renderPlanner);

// Generate AI itinerary
router.post("/plan-trip", isLoggedIn, aiPlannerController.planTrip);

// Save AI itinerary
router.post("/save-trip", isLoggedIn, aiPlannerController.saveTrip);

module.exports = router;
