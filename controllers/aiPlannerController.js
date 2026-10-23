const mongoose = require("mongoose");
const SavedTrip = require("../models/savetrip.js");
const aiplanner = require("../aiplanner.js");

module.exports.renderPlanner = (req, res) => {
  res.render("tourism/planner.ejs");
};

module.exports.planTrip = aiplanner;

module.exports.saveTrip = async (req, res) => {
  try {
    let { itinerary } = req.body;

    if (!itinerary) {
      req.flash("error", "Trip data missing.");
      return res.redirect("/plan-trip");
    }

    if (typeof itinerary === "string") {
      itinerary = JSON.parse(itinerary);
    }

    if (!itinerary.days || !Array.isArray(itinerary.days)) {
      req.flash("error", "Invalid trip days.");
      return res.redirect("/plan-trip");
    }

    const cleanedDays = itinerary.days.map(day => {
      let activities = day.activities || [];

      if (typeof activities === "string") {
        try {
          activities = JSON.parse(activities);
        } catch (error) {
          console.error("ACTIVITIES JSON ERROR:", error);
          activities = [];
        }
      }

      if (!Array.isArray(activities)) {
        activities = [];
      }

      return {
        day: Number(day.day) || 1,
        title: day.title || "",
        activities: activities.map(activity => ({
          time: activity.time || "",
          type: activity.type || "",
          from: activity.from || "",
          to: activity.to || "",
          place: activity.place || "",
          placeId: (activity.placeId && mongoose.Types.ObjectId.isValid(activity.placeId)) ? activity.placeId : undefined,
          duration: activity.duration || "",
          description: activity.description || ""
        }))
      };
    });

    const estimatedCost = {
      travel: itinerary.estimatedCost?.travel || "0",
      food: itinerary.estimatedCost?.food || "0",
      entryFees: itinerary.estimatedCost?.entryFees || "0",
      total: itinerary.estimatedCost?.total || "0"
    };

    const savedTrip = await SavedTrip.create({
      user: req.user._id,
      summary: itinerary.summary || "",
      days: cleanedDays,
      estimatedCost
    });

    console.log("TRIP SAVED SUCCESSFULLY:", savedTrip._id);
    req.flash("success", "Trip saved successfully ❤️");
    return res.redirect("/my-trips");
  } catch (error) {
    console.error("SAVE TRIP ERROR:", error);
    req.flash("error", "Failed to save trip.");
    return res.redirect("/plan-trip");
  }
};
