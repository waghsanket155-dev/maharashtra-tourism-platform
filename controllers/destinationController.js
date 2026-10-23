const mongoose = require("mongoose");
const place = require("../models/destination.js");
const touristplace = require("../models/destination.js");

// Public: Explore Destinations
module.exports.explore = async (req, res) => {
  try {
    const data = await touristplace.find({});
    res.render("tourism/explore.ejs", { data });
  } catch (err) {
    console.error("EXPLORE ERROR:", err);
    req.flash("error", "Unable to load destinations.");
    res.redirect("/home");
  }
};

// Public: Destination Details
module.exports.getDestination = async (req, res) => {
  try {
    const data = await place.findById(req.params.id).populate("author");
    if (!data) {
      req.flash("error", "Destination not found.");
      return res.redirect("/explore");
    }
    res.render("tourism/show.ejs", { place: data });
  } catch (err) {
    console.error("Error fetching tourist place:", err);
    req.flash("error", "Failed to retrieve destination details.");
    res.redirect("/explore");
  }
};

// Public: Place Redirect
module.exports.redirectPlace = (req, res) => {
  res.redirect("/touristplaces/" + req.params.id);
};

// Public API: Destinations JSON
module.exports.getDestinationsApi = async (req, res) => {
  try {
    const destinations = await touristplace
      .find({})
      .select("name district category location rating")
      .sort({ name: 1 })
      .lean();
    res.json({ success: true, count: destinations.length, destinations });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch destinations" });
  }
};

// Admin: Manage Places
module.exports.adminPlaces = async (req, res) => {
  try {
    const search = (req.query.search || "").trim();
    const category = (req.query.category || "all").trim();

    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { district: { $regex: search, $options: "i" } }
      ];
    }
    if (category && category !== "all") {
      filter.category = category;
    }

    const places = await place.find(filter).sort({ name: 1 });
    const totalPlaces = await place.countDocuments();
    const totalDistricts = (await place.distinct("district")).length;
    const categoriesList = await place.distinct("category");
    const geofencedCount = await place.countDocuments({ "geoFence.enabled": true });

    const allCategories = [
      "Historical", "Religious", "Nature", "Wildlife", "Park / Garden",
      "Museum", "Beach", "Adventure", "Family", "Park / Family",
      "Leisure", "Trekking", "Wellness", "Cultural", "Hill Station"
    ];

    res.render("admin/places.ejs", {
      places,
      totalPlaces,
      totalDistricts,
      categoriesCount: categoriesList.length,
      geofencedCount,
      allCategories,
      currentCategory: category,
      search
    });
  } catch (err) {
    console.error("ADMIN PLACES ERROR:", err);
    req.flash("error", "Unable to load destinations directory.");
    res.redirect("/dashboard");
  }
};

// Admin: New Place Form
module.exports.renderNewForm = (req, res) => {
  res.render("admin/new.ejs");
};

// Admin: Create Place
module.exports.createPlace = async (req, res) => {
  try {
    const body = req.body.touristPlace || req.body;
    const { name, district, category, description } = body;

    if (!name || !district || !category || !description) {
      req.flash("error", "Please provide all required fields (Name, District, Category, Description).");
      return res.redirect("/admin/new");
    }

    let images = [];
    if (Array.isArray(body.images)) {
      images = body.images.filter(img => typeof img === "string" && img.trim());
    } else if (typeof body.images === "string" && body.images.trim()) {
      images = body.images.split(",").map(img => img.trim()).filter(Boolean);
    }
    if (images.length === 0) {
      images = ["https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&w=1200&q=80"];
    }

    let activities = [];
    if (Array.isArray(body.activities)) {
      activities = body.activities;
    } else if (typeof body.activities === "string" && body.activities.trim()) {
      activities = body.activities.split(",").map(a => a.trim()).filter(Boolean);
    }

    let nearbyPlaces = [];
    if (Array.isArray(body.nearbyPlaces)) {
      nearbyPlaces = body.nearbyPlaces;
    } else if (typeof body.nearbyPlaces === "string" && body.nearbyPlaces.trim()) {
      nearbyPlaces = body.nearbyPlaces.split(",").map(p => p.trim()).filter(Boolean);
    }

    const location = {
      address: body.location?.address || body.address || "",
      latitude: Number(body.location?.latitude ?? body.latitude ?? 0) || 0,
      longitude: Number(body.location?.longitude ?? body.longitude ?? 0) || 0
    };

    const entryFee = {
      indian: Number(body.entryFee?.indian ?? body.entryFeeIndian ?? 0) || null,
      foreign: Number(body.entryFee?.foreign ?? body.entryFeeForeign ?? 0) || null,
      currency: body.entryFee?.currency || body.currency || "INR",
      notes: body.entryFee?.notes || body.feeNotes || ""
    };

    const geoFence = {
      enabled: body.geoFence?.enabled === "true" || body.geoFence?.enabled === true || body.geoFence?.enabled === "on",
      radius: Number(body.geoFence?.radius ?? 500) || 500,
      zoneType: body.geoFence?.zoneType || "tourist_area",
      status: body.geoFence?.status || "unverified",
      restrictedReason: body.geoFence?.restrictedReason || ""
    };

    const newPlace = new place({
      name: name.trim(),
      district: district.trim(),
      category: category.trim(),
      description: description.trim(),
      images,
      location,
      rating: body.rating ? Number(body.rating) : 4.0,
      bestTime: body.bestTime || null,
      openingTime: body.openingTime || null,
      closingTime: body.closingTime || null,
      entryFee,
      activities,
      nearbyPlaces,
      geoFence,
      author: req.user?._id
    });

    await newPlace.save();
    req.flash("success", `Tourist destination "${newPlace.name}" added successfully!`);
    res.redirect("/places");
  } catch (err) {
    console.error("CREATE PLACE ERROR:", err);
    req.flash("error", "Failed to add destination: " + (err.message || ""));
    res.redirect("/admin/new");
  }
};

// Admin: Edit Place Form
module.exports.renderEditForm = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash("error", "Invalid destination ID.");
      return res.redirect("/places");
    }

    const foundPlace = await place.findById(id);
    if (!foundPlace) {
      req.flash("error", "Tourist destination not found.");
      return res.redirect("/places");
    }

    res.render("admin/editPlace.ejs", { place: foundPlace });
  } catch (err) {
    console.error("EDIT PLACE FORM ERROR:", err);
    req.flash("error", "Unable to load edit page.");
    res.redirect("/places");
  }
};

// Admin: Update Place
module.exports.updatePlace = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash("error", "Invalid destination ID.");
      return res.redirect("/places");
    }

    const foundPlace = await place.findById(id);
    if (!foundPlace) {
      req.flash("error", "Destination not found.");
      return res.redirect("/places");
    }

    const body = req.body.touristPlace || req.body;
    if (body.name) foundPlace.name = body.name.trim();
    if (body.district) foundPlace.district = body.district.trim();
    if (body.category) foundPlace.category = body.category.trim();
    if (body.description) foundPlace.description = body.description.trim();

    if (body.images) {
      if (Array.isArray(body.images)) {
        foundPlace.images = body.images.filter(img => typeof img === "string" && img.trim());
      } else if (typeof body.images === "string" && body.images.trim()) {
        foundPlace.images = body.images.split(",").map(img => img.trim()).filter(Boolean);
      }
    }

    if (body.rating !== undefined && body.rating !== "") {
      foundPlace.rating = Number(body.rating);
    }

    if (!foundPlace.location) foundPlace.location = {};
    if (body.address || body.location?.address) {
      foundPlace.location.address = body.address || body.location.address;
    }
    if (body.latitude !== undefined || body.location?.latitude !== undefined) {
      foundPlace.location.latitude = Number(body.latitude ?? body.location?.latitude ?? 0);
    }
    if (body.longitude !== undefined || body.location?.longitude !== undefined) {
      foundPlace.location.longitude = Number(body.longitude ?? body.location?.longitude ?? 0);
    }

    if (body.bestTime !== undefined) foundPlace.bestTime = body.bestTime;
    if (body.openingTime !== undefined) foundPlace.openingTime = body.openingTime;
    if (body.closingTime !== undefined) foundPlace.closingTime = body.closingTime;

    if (!foundPlace.entryFee) foundPlace.entryFee = {};
    if (body.entryFeeIndian !== undefined || body.entryFee?.indian !== undefined) {
      foundPlace.entryFee.indian = Number(body.entryFeeIndian ?? body.entryFee?.indian);
    }
    if (body.entryFeeForeign !== undefined || body.entryFee?.foreign !== undefined) {
      foundPlace.entryFee.foreign = Number(body.entryFeeForeign ?? body.entryFee?.foreign);
    }

    await foundPlace.save();
    req.flash("success", `Destination "${foundPlace.name}" updated successfully.`);
    res.redirect("/places");
  } catch (err) {
    console.error("UPDATE PLACE ERROR:", err);
    req.flash("error", "Failed to update destination: " + (err.message || ""));
    res.redirect("/places");
  }
};

// Admin: Delete Place
module.exports.deletePlace = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash("error", "Invalid destination ID.");
      return res.redirect("/places");
    }

    const deleted = await place.findByIdAndDelete(id);
    if (!deleted) {
      req.flash("error", "Destination not found.");
      return res.redirect("/places");
    }

    req.flash("success", `Destination "${deleted.name}" has been deleted.`);
    res.redirect("/places");
  } catch (err) {
    console.error("DELETE PLACE ERROR:", err);
    req.flash("error", "Failed to delete destination.");
    res.redirect("/places");
  }
};
