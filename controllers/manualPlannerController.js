const mongoose = require("mongoose");
const ManualPlanner = require("../models/manualPlanner.js");
const touristplace = require("../models/destination.js");
const SavedTrip = require("../models/savetrip.js");

module.exports.renderManualPlanner = async (req, res) => {
  try {
    const plannerPlaces = await ManualPlanner
      .find({ user_id: req.user._id })
      .populate("destination_id")
      .sort({ createdAt: -1 });

    const allDestinations = await touristplace.find({}).sort({ name: 1 });
    const categories = [...new Set(allDestinations.map(d => d.category).filter(Boolean))].sort();
    const districts = [...new Set(allDestinations.map(d => d.district).filter(Boolean))].sort();

    res.render("tourism/mplanner.ejs", {
      plannerPlaces: plannerPlaces.filter(p => p.destination_id),
      allDestinations,
      categories,
      districts,
      tripToEdit: null
    });
  } catch (err) {
    console.error("VIEW MANUAL PLANNER ERROR:", err);
    req.flash("error", "Unable to load your planner.");
    res.redirect("/explore");
  }
};

module.exports.addDestination = async (req, res) => {
  try {
    const { destinationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(destinationId)) {
      req.flash("error", "Invalid destination.");
      return res.redirect("/explore");
    }

    const destination = await touristplace.findById(destinationId);
    if (!destination) {
      req.flash("error", "Destination not found.");
      return res.redirect("/explore");
    }

    const alreadyAdded = await ManualPlanner.findOne({
      user_id: req.user._id,
      destination_id: destinationId
    });

    if (alreadyAdded) {
      req.flash("error", "This destination is already in your planner.");
      const referer = req.headers.referer || "";
      return res.redirect(referer.includes("/explore") ? "/explore" : "/m-planner");
    }

    await ManualPlanner.create({
      user_id: req.user._id,
      destination_id: destinationId
    });

    req.flash("success", "Destination added to your planner!");
    return res.redirect("/m-planner");
  } catch (err) {
    console.error("ADD MANUAL PLANNER ERROR:", err);
    req.flash("error", "Unable to add destination.");
    res.redirect("/explore");
  }
};

module.exports.getAddDestination = async (req, res) => {
  try {
    const { destinationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(destinationId)) {
      req.flash("error", "Invalid destination.");
      return res.redirect("/explore");
    }

    const destination = await touristplace.findById(destinationId);
    if (!destination) {
      req.flash("error", "Destination not found.");
      return res.redirect("/explore");
    }

    const alreadyAdded = await ManualPlanner.findOne({
      user_id: req.user._id,
      destination_id: destinationId
    });

    if (!alreadyAdded) {
      await ManualPlanner.create({
        user_id: req.user._id,
        destination_id: destinationId
      });
      req.flash("success", "Destination added to your planner!");
    }

    return res.redirect("/explore");
  } catch (err) {
    console.error("GET ADD MANUAL PLANNER ERROR:", err);
    req.flash("error", "Unable to add destination.");
    return res.redirect("/explore");
  }
};

module.exports.removeDestination = async (req, res) => {
  try {
    const { destinationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(destinationId)) {
      req.flash("error", "Invalid destination.");
      return res.redirect("/m-planner");
    }

    const deletedPlanner = await ManualPlanner.findOneAndDelete({
      user_id: req.user._id,
      destination_id: destinationId
    });

    if (!deletedPlanner) {
      req.flash("error", "Destination not found in your planner.");
      return res.redirect("/m-planner");
    }

    req.flash("success", "Destination removed from your planner.");
    return res.redirect("/m-planner");
  } catch (err) {
    console.error("REMOVE PLANNER DESTINATION ERROR:", err);
    req.flash("error", "Unable to remove destination.");
    return res.redirect("/m-planner");
  }
};

module.exports.removeDestinationAlias = async (req, res) => {
  try {
    const { destinationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(destinationId)) {
      req.flash("error", "Invalid destination.");
      return res.redirect("/m-planner");
    }

    await ManualPlanner.findOneAndDelete({
      user_id: req.user._id,
      destination_id: destinationId
    });

    req.flash("success", "Destination removed from your planner.");
    return res.redirect("/m-planner");
  } catch (err) {
    console.error("REMOVE PLANNER ALIAS ERROR:", err);
    return res.redirect("/m-planner");
  }
};

module.exports.saveManualTrip = async (req, res) => {
  try {
    let payload = req.body;
    if (req.body.itineraryPayload) {
      try {
        payload = JSON.parse(req.body.itineraryPayload);
      } catch (e) {
        console.error("PAYLOAD PARSE ERROR:", e);
      }
    }

    const { tripName, startingCity, startDate, travelers, budget, notes, summary, days } = payload;

    if (!tripName || !startingCity || !startDate) {
      req.flash("error", "Please provide all required trip details.");
      return res.redirect("/m-planner");
    }

    if (!days || !Array.isArray(days) || days.length === 0) {
      req.flash("error", "Trip must have at least one day.");
      return res.redirect("/m-planner");
    }

    let grandTransport = 0;
    let grandFood = 0;
    let grandEntry = 0;
    let grandOther = 0;
    let totalActivitiesCount = 0;

    const cleanedDays = days.map((day, idx) => {
      const activities = (day.activities || []).map(act => {
        const tCost = Math.max(0, Number(act.transportCost) || 0);
        const fCost = Math.max(0, Number(act.foodCost) || 0);
        const eCost = Math.max(0, Number(act.entryFee) || 0);
        const oCost = Math.max(0, Number(act.otherCost) || 0);

        grandTransport += tCost;
        grandFood += fCost;
        grandEntry += eCost;
        grandOther += oCost;
        totalActivitiesCount++;

        return {
          time: act.time || act.arrivalTime || "",
          arrivalTime: act.arrivalTime || act.time || "",
          departureTime: act.departureTime || "",
          type: act.type || "visit",
          from: act.from || "",
          to: act.to || "",
          place: act.place || "Stop",
          placeId: (act.placeId && mongoose.Types.ObjectId.isValid(act.placeId)) ? act.placeId : undefined,
          duration: act.duration || "",
          description: act.description || act.notes || "",
          notes: act.notes || act.description || "",
          transportMode: act.transportMode || "",
          transportCost: tCost,
          entryFee: eCost,
          foodCost: fCost,
          otherCost: oCost
        };
      });

      return {
        day: Number(day.day) || (idx + 1),
        date: day.date || "",
        title: day.title || `Day ${idx + 1}`,
        activities
      };
    });

    if (totalActivitiesCount === 0) {
      req.flash("error", "Please add at least one stop or activity to your itinerary.");
      return res.redirect("/m-planner");
    }

    const grandTotal = grandTransport + grandFood + grandEntry + grandOther;

    const savedTrip = await SavedTrip.create({
      user: req.user._id,
      tripName: tripName.trim(),
      title: tripName.trim(),
      tripType: "manual",
      startingCity: startingCity.trim(),
      startDate: startDate,
      travelers: Math.max(1, Number(travelers) || 1),
      budget: Math.max(0, Number(budget) || 0),
      notes: notes ? notes.trim() : "",
      summary: summary ? summary.trim() : `${cleanedDays.length}-day trip from ${startingCity} exploring Maharashtra destinations, for ${travelers} traveler(s) with an estimated cost of ₹${grandTotal.toLocaleString('en-IN')}.`,
      days: cleanedDays,
      estimatedCost: {
        travel: grandTransport,
        food: grandFood,
        entryFees: grandEntry,
        other: grandOther,
        total: grandTotal
      }
    });

    console.log("MANUAL TRIP SAVED TO MONGODB SUCCESSFULLY:", savedTrip._id);
    req.flash("success", "Trip saved successfully to My Trips ❤️");
    return res.redirect("/my-trips");
  } catch (error) {
    console.error("SAVE MANUAL TRIP ERROR:", error);
    req.flash("error", "Failed to save trip.");
    return res.redirect("/m-planner");
  }
};
