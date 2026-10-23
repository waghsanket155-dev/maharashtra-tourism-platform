const express = require("express");
const router = express.Router();
const manualPlannerController = require("../controllers/manualPlannerController.js");
const { isLoggedIn } = require("../middleware.js");

// Redirect manual-planner to m-planner
router.get("/manual-planner", (req, res) => {
  res.redirect("/m-planner");
});

// Render manual planner workspace
router.get("/m-planner", isLoggedIn, manualPlannerController.renderManualPlanner);

// Add destination to manual planner (POST and GET fallback)
router.post("/m-planner/:destinationId", isLoggedIn, manualPlannerController.addDestination);
router.get("/m-planner/:destinationId", isLoggedIn, manualPlannerController.getAddDestination);

// Remove destination from manual planner
router.delete("/m-planner/:destinationId", isLoggedIn, manualPlannerController.removeDestination);
router.post("/m-planner/:destinationId/remove", isLoggedIn, manualPlannerController.removeDestination);
router.delete("/touristplaces/:destinationId", isLoggedIn, manualPlannerController.removeDestinationAlias);

// Save complete manual trip to MongoDB
router.post("/save-manual-trip", isLoggedIn, manualPlannerController.saveManualTrip);

module.exports = router;
