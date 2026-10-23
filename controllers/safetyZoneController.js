const mongoose = require("mongoose");
const SafetyZone = require("../models/safetyZone.js");

// 1. List Safety Zones (with status & type filters)
exports.listZones = async (req, res) => {
  try {
    const { status, zoneType } = req.query;
    const filter = {};
    if (status && status !== "all") {
      filter.verificationStatus = status;
    }
    if (zoneType && zoneType !== "all") {
      filter.zoneType = zoneType;
    }

    const zones = await SafetyZone.find(filter)
      .populate("createdBy", "username email")
      .populate("verifiedBy", "username email")
      .sort({ createdAt: -1 });

    const total = await SafetyZone.countDocuments();
    const pending = await SafetyZone.countDocuments({ verificationStatus: "pending" });
    const verified = await SafetyZone.countDocuments({ verificationStatus: "verified" });
    const restricted = await SafetyZone.countDocuments({ zoneType: "restricted_area" });

    res.render("admin/safetyZones.ejs", {
      zones,
      stats: { total, pending, verified, restricted },
      currentStatus: status || "all",
      currentType: zoneType || "all"
    });
  } catch (err) {
    console.error("ADMIN SAFETY ZONES ERROR:", err);
    req.flash("error", "Unable to load safety zones.");
    res.redirect("/dashboard");
  }
};

// 2. Add Safety Zone Form
exports.renderNewForm = (req, res) => {
  res.render("admin/safetyZoneForm.ejs", {
    zone: null,
    action: "/admin/safety-zones",
    isEdit: false
  });
};

// 3. Create Safety Zone (Defaults strictly to pending)
exports.createZone = async (req, res) => {
  try {
    const {
      name,
      district,
      latitude,
      longitude,
      radius,
      zoneType,
      restrictedReason,
      sourceName,
      sourceUrl,
      notificationNumber,
      validFrom,
      validUntil
    } = req.body;

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    const radNum = parseFloat(radius);

    if (!name || name.trim().length < 2) {
      req.flash("error", "Zone name must be at least 2 characters long.");
      return res.redirect("/admin/safety-zones/new");
    }

    if (!district || district.trim().length === 0) {
      req.flash("error", "District is required.");
      return res.redirect("/admin/safety-zones/new");
    }

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      req.flash("error", "Latitude must be a valid number between -90 and 90.");
      return res.redirect("/admin/safety-zones/new");
    }

    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      req.flash("error", "Longitude must be a valid number between -180 and 180.");
      return res.redirect("/admin/safety-zones/new");
    }

    if (isNaN(radNum) || radNum <= 0) {
      req.flash("error", "Radius must be a positive number.");
      return res.redirect("/admin/safety-zones/new");
    }

    const validZoneTypes = ["restricted_area", "caution_zone", "safe_zone"];
    if (!zoneType || !validZoneTypes.includes(zoneType)) {
      req.flash("error", "Invalid zone type selected.");
      return res.redirect("/admin/safety-zones/new");
    }

    if ((zoneType === "restricted_area" || zoneType === "caution_zone") && (!restrictedReason || restrictedReason.trim().length === 0)) {
      req.flash("error", "Restricted reason is mandatory for restricted areas and caution zones.");
      return res.redirect("/admin/safety-zones/new");
    }

    if (!sourceName || sourceName.trim().length === 0) {
      req.flash("error", "Official source authority name is required.");
      return res.redirect("/admin/safety-zones/new");
    }

    if (!sourceUrl || (!sourceUrl.startsWith("http://") && !sourceUrl.startsWith("https://"))) {
      req.flash("error", "Source URL must be a valid HTTP or HTTPS URL.");
      return res.redirect("/admin/safety-zones/new");
    }

    let parsedValidFrom = validFrom ? new Date(validFrom) : null;
    let parsedValidUntil = validUntil ? new Date(validUntil) : null;
    if (parsedValidFrom && isNaN(parsedValidFrom.getTime())) parsedValidFrom = null;
    if (parsedValidUntil && isNaN(parsedValidUntil.getTime())) parsedValidUntil = null;

    if (parsedValidFrom && parsedValidUntil && parsedValidUntil < parsedValidFrom) {
      req.flash("error", "Valid Until date cannot be earlier than Valid From date.");
      return res.redirect("/admin/safety-zones/new");
    }

    const newZone = new SafetyZone({
      name: name.trim(),
      district: district.trim(),
      latitude: latNum,
      longitude: lngNum,
      radius: radNum,
      zoneType,
      restrictedReason: restrictedReason ? restrictedReason.trim() : "",
      sourceName: sourceName.trim(),
      sourceUrl: sourceUrl.trim(),
      notificationNumber: notificationNumber ? notificationNumber.trim() : "",
      verificationStatus: "pending",
      isActive: true,
      validFrom: parsedValidFrom,
      validUntil: parsedValidUntil,
      createdBy: req.user._id,
      verifiedBy: null,
      verifiedAt: null,
      geometry: {
        type: "Point",
        coordinates: [lngNum, latNum]
      }
    });

    await newZone.save();
    req.flash("success", `Safety zone "${newZone.name}" created. Verification status set to Pending.`);
    res.redirect("/admin/safety-zones");
  } catch (err) {
    console.error("CREATE SAFETY ZONE ERROR:", err);
    req.flash("error", "Failed to create safety zone. Please check your inputs.");
    res.redirect("/admin/safety-zones/new");
  }
};

// 4. Edit Safety Zone Form
exports.renderEditForm = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid zone ID.");
      return res.redirect("/admin/safety-zones");
    }

    const zone = await SafetyZone.findById(req.params.id);
    if (!zone) {
      req.flash("error", "Safety zone not found.");
      return res.redirect("/admin/safety-zones");
    }

    res.render("admin/safetyZoneForm.ejs", {
      zone,
      action: `/admin/safety-zones/${zone._id}`,
      isEdit: true
    });
  } catch (err) {
    console.error("EDIT SAFETY ZONE GET ERROR:", err);
    req.flash("error", "Error loading safety zone.");
    res.redirect("/admin/safety-zones");
  }
};

// 5. Update Safety Zone Details
exports.updateZone = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid zone ID.");
      return res.redirect("/admin/safety-zones");
    }

    const zone = await SafetyZone.findById(req.params.id);
    if (!zone) {
      req.flash("error", "Safety zone not found.");
      return res.redirect("/admin/safety-zones");
    }

    const {
      name,
      district,
      latitude,
      longitude,
      radius,
      zoneType,
      restrictedReason,
      sourceName,
      sourceUrl,
      notificationNumber,
      validFrom,
      validUntil
    } = req.body;

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    const radNum = parseFloat(radius);

    if (!name || name.trim().length < 2) {
      req.flash("error", "Zone name must be at least 2 characters long.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    if (!district || district.trim().length === 0) {
      req.flash("error", "District is required.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      req.flash("error", "Latitude must be a valid number between -90 and 90.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      req.flash("error", "Longitude must be a valid number between -180 and 180.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    if (isNaN(radNum) || radNum <= 0) {
      req.flash("error", "Radius must be a positive number.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    const validZoneTypes = ["restricted_area", "caution_zone", "safe_zone"];
    if (!zoneType || !validZoneTypes.includes(zoneType)) {
      req.flash("error", "Invalid zone type selected.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    if ((zoneType === "restricted_area" || zoneType === "caution_zone") && (!restrictedReason || restrictedReason.trim().length === 0)) {
      req.flash("error", "Restricted reason is mandatory for restricted areas and caution zones.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    if (!sourceName || sourceName.trim().length === 0) {
      req.flash("error", "Official source authority name is required.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    if (!sourceUrl || (!sourceUrl.startsWith("http://") && !sourceUrl.startsWith("https://"))) {
      req.flash("error", "Source URL must be a valid HTTP or HTTPS URL.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    let parsedValidFrom = validFrom ? new Date(validFrom) : null;
    let parsedValidUntil = validUntil ? new Date(validUntil) : null;
    if (parsedValidFrom && isNaN(parsedValidFrom.getTime())) parsedValidFrom = null;
    if (parsedValidUntil && isNaN(parsedValidUntil.getTime())) parsedValidUntil = null;

    if (parsedValidFrom && parsedValidUntil && parsedValidUntil < parsedValidFrom) {
      req.flash("error", "Valid Until date cannot be earlier than Valid From date.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    zone.name = name.trim();
    zone.district = district.trim();
    zone.latitude = latNum;
    zone.longitude = lngNum;
    zone.radius = radNum;
    zone.zoneType = zoneType;
    zone.restrictedReason = restrictedReason ? restrictedReason.trim() : "";
    zone.sourceName = sourceName.trim();
    zone.sourceUrl = sourceUrl.trim();
    zone.notificationNumber = notificationNumber ? notificationNumber.trim() : "";
    zone.validFrom = parsedValidFrom;
    zone.validUntil = parsedValidUntil;
    zone.geometry = {
      type: "Point",
      coordinates: [lngNum, latNum]
    };

    await zone.save();
    req.flash("success", `Safety zone "${zone.name}" updated successfully.`);
    res.redirect("/admin/safety-zones");
  } catch (err) {
    console.error("EDIT SAFETY ZONE POST ERROR:", err);
    req.flash("error", "Failed to update safety zone.");
    res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
  }
};

// 6. Verify or Reject Safety Zone
exports.verifyZone = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid zone ID.");
      return res.redirect("/admin/safety-zones");
    }

    const { decision } = req.body;
    if (!["verified", "rejected"].includes(decision)) {
      req.flash("error", "Invalid verification decision.");
      return res.redirect("/admin/safety-zones");
    }

    const zone = await SafetyZone.findById(req.params.id);
    if (!zone) {
      req.flash("error", "Safety zone not found.");
      return res.redirect("/admin/safety-zones");
    }

    if (decision === "verified") {
      if (!zone.sourceName || !zone.sourceUrl) {
        req.flash("error", "Cannot verify zone without official source name and URL.");
        return res.redirect("/admin/safety-zones");
      }
      zone.verificationStatus = "verified";
      zone.verifiedBy = req.user._id;
      zone.verifiedAt = new Date();
    } else {
      zone.verificationStatus = "rejected";
      zone.verifiedBy = req.user._id;
      zone.verifiedAt = new Date();
    }

    await zone.save();
    req.flash("success", `Safety zone "${zone.name}" marked as ${decision}.`);
    res.redirect("/admin/safety-zones");
  } catch (err) {
    console.error("VERIFY SAFETY ZONE ERROR:", err);
    req.flash("error", "Failed to update verification status.");
    res.redirect("/admin/safety-zones");
  }
};

// 7. Toggle Active/Inactive
exports.toggleActive = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid zone ID.");
      return res.redirect("/admin/safety-zones");
    }

    const zone = await SafetyZone.findById(req.params.id);
    if (!zone) {
      req.flash("error", "Safety zone not found.");
      return res.redirect("/admin/safety-zones");
    }

    zone.isActive = !zone.isActive;
    await zone.save();

    req.flash("success", `Zone "${zone.name}" is now ${zone.isActive ? "active" : "deactivated"}.`);
    res.redirect("/admin/safety-zones");
  } catch (err) {
    console.error("TOGGLE ACTIVE ERROR:", err);
    req.flash("error", "Failed to toggle zone active state.");
    res.redirect("/admin/safety-zones");
  }
};

// 8. Delete Safety Zone
exports.deleteZone = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid zone ID.");
      return res.redirect("/admin/safety-zones");
    }

    const zone = await SafetyZone.findByIdAndDelete(req.params.id);
    if (!zone) {
      req.flash("error", "Safety zone not found.");
      return res.redirect("/admin/safety-zones");
    }

    req.flash("success", `Safety zone "${zone.name}" has been deleted.`);
    res.redirect("/admin/safety-zones");
  } catch (err) {
    console.error("DELETE SAFETY ZONE ERROR:", err);
    req.flash("error", "Failed to delete safety zone.");
    res.redirect("/admin/safety-zones");
  }
};
