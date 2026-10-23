const express = require("express");
const router = express.Router();

const authRoutes = require("./auth.js");
const destinationRoutes = require("./destinations.js");
const manualPlannerRoutes = require("./manualPlanner.js");
const aiPlannerRoutes = require("./aiPlanner.js");
const tripRoutes = require("./trips.js");
const safetyRoutes = require("./safety.js");
const adminRoutes = require("./admin.js");

// Static and information routes
router.get(["/", "/home"], (req, res) => {
  res.render("tourism/index.ejs");
});

router.get("/about", (req, res) => {
  res.render("tourism/about.ejs");
});

router.get("/privacy", (req, res) => {
  res.render("footer/privacy.ejs");
});

router.get("/term", (req, res) => {
  res.render("footer/term.ejs");
});

router.get("/booking", (req, res) => {
  res.redirect("https://www.mtdc.co/");
});

router.get("/guides", (req, res) => {
  res.redirect("/explore");
});

// Mount domain routers
router.use("/", authRoutes);
router.use("/", destinationRoutes);
router.use("/", manualPlannerRoutes);
router.use("/", aiPlannerRoutes);
router.use("/", tripRoutes);
router.use("/", safetyRoutes);
router.use("/", adminRoutes);

module.exports = router;
