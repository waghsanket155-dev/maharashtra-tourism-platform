const mongoose = require("mongoose");
const Incident = require("../models/incident.js");
const SafetyZone = require("../models/safetyZone.js");

// In-memory rate limiting map for SOS incident submissions
const incidentSubmissionHistory = new Map();

function isSosRateLimited(userId, ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000; // 10 minutes window
  const maxLimit = 5; // Max 5 reports per 10 minutes

  const key = `${userId || 'anon'}_${ip || 'unknown'}`;
  const timestamps = incidentSubmissionHistory.get(key) || [];
  const validTimestamps = timestamps.filter(t => now - t < windowMs);

  if (validTimestamps.length >= maxLimit) {
    return true;
  }

  validTimestamps.push(now);
  incidentSubmissionHistory.set(key, validTimestamps);
  return false;
}

// 1. Tourist Safety Dashboard
exports.renderSafetyDashboard = async (req, res) => {
  res.render("tourism/safety.ejs");
};

// 2. Fetch Geo-Fence zones for client-side evaluation
exports.getGeofencesApi = async (req, res) => {
  try {
    // Return only active, verified, and currently valid zones
    const activeZones = await SafetyZone.findActiveVerified().lean();

    const zones = activeZones
      .map(z => ({
        id: z._id.toString(),
        _id: z._id.toString(),
        name: z.name,
        title: z.name,
        district: z.district || "",
        category: z.zoneType,
        latitude: Number(z.latitude),
        longitude: Number(z.longitude),
        radius: Number(z.radius),
        zoneType: z.zoneType,
        status: z.verificationStatus,
        verificationStatus: z.verificationStatus,
        restrictedReason: z.restrictedReason || "",
        sourceName: z.sourceName || "",
        sourceUrl: z.sourceUrl || "",
        notificationNumber: z.notificationNumber || "",
        geometry: z.geometry || null
      }))
      .filter(z => !isNaN(z.latitude) && !isNaN(z.longitude) && z.radius > 0);

    if (req.query.format === "array") {
      return res.json(zones);
    }

    res.json({
      success: true,
      count: zones.length,
      zones
    });
  } catch (err) {
    console.error("GEOFENCE API ERROR:", err);
    res.status(500).json({ success: false, error: "Failed to load safety zones." });
  }
};

// 3. Create SOS Incident Report
exports.submitIncident = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const userIp = req.ip || req.connection?.remoteAddress || "";

    // Rate Limiting Check
    if (isSosRateLimited(userId, userIp)) {
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(429).json({
          success: false,
          error: "Too many incident reports submitted. Please wait before submitting again. For immediate danger, call 112 directly."
        });
      }
      req.flash("error", "Too many reports submitted. Please wait. For immediate emergencies, call 112.");
      return res.redirect("/safety");
    }

    const { incidentType, description, phone, userPhone, alternateContact, locationConsent, latitude, longitude, accuracy, capturedAt, address } = req.body;

    // Validate Incident Type
    const validTypes = [
      "medical_emergency",
      "lost_tourist",
      "harassment_safety",
      "accident_injury",
      "unsafe_restricted_area",
      "lost_belongings",
      "other"
    ];

    if (!incidentType || !validTypes.includes(incidentType)) {
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(400).json({ success: false, error: "Invalid incident category." });
      }
      req.flash("error", "Invalid incident category.");
      return res.redirect("/safety");
    }

    // Validate Description
    if (!description || typeof description !== "string" || description.trim().length < 5) {
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(400).json({ success: false, error: "Description must be at least 5 characters long." });
      }
      req.flash("error", "Description must be at least 5 characters long.");
      return res.redirect("/safety");
    }

    const hasLocationConsent = locationConsent === true || locationConsent === "true" || locationConsent === "on";

    // Validate optional location coordinates if consent was given
    const locationData = {
      address: hasLocationConsent && typeof address === "string" ? address.trim() : "",
      latitude: null,
      longitude: null,
      accuracy: null,
      capturedAt: null
    };

    if (hasLocationConsent && latitude !== undefined && longitude !== undefined && latitude !== null && longitude !== null) {
      const latNum = Number(latitude);
      const lngNum = Number(longitude);
      const accNum = accuracy !== undefined && accuracy !== null ? Number(accuracy) : null;

      if (!isNaN(latNum) && !isNaN(lngNum) && latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180) {
        locationData.latitude = latNum;
        locationData.longitude = lngNum;
        locationData.accuracy = (!isNaN(accNum) && accNum >= 0) ? accNum : null;
        locationData.capturedAt = capturedAt ? new Date(capturedAt) : new Date();
      }
    }

    const reportId = Incident.generateReportId();

    const newIncident = await Incident.create({
      reportId,
      user: req.user._id,
      incidentType,
      description: description.trim(),
      locationConsent: hasLocationConsent && locationData.latitude !== null,
      location: locationData,
      userName: req.user.username || "",
      userEmail: req.user.email || "",
      userPhone: typeof userPhone === "string" ? userPhone.trim() : (typeof phone === "string" ? phone.trim() : ""),
      contactInfo: {
        phone: typeof userPhone === "string" ? userPhone.trim() : (typeof phone === "string" ? phone.trim() : ""),
        alternateContact: typeof alternateContact === "string" ? alternateContact.trim() : ""
      },
      status: "Pending",
      ipAddress: userIp
    });

    console.log(`INCIDENT REPORT CREATED [${reportId}] by user ${req.user._id}`);

    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.status(201).json({
        success: true,
        reportId: newIncident.reportId,
        id: newIncident._id,
        message: "Incident report submitted successfully."
      });
    }

    req.flash("success", `Incident report ${reportId} submitted successfully.`);
    return res.redirect("/my-incidents");

  } catch (err) {
    console.error("CREATE INCIDENT ERROR:", err);
    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.status(500).json({ success: false, error: "Server error creating incident report." });
    }
    req.flash("error", "Unable to submit incident report. For emergencies, call 112.");
    return res.redirect("/safety");
  }
};

// 4. View User's Own Incidents
exports.listMyIncidents = async (req, res) => {
  try {
    const incidents = await Incident.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.render("tourism/myincidents.ejs", { incidents });
  } catch (err) {
    console.error("GET MY INCIDENTS ERROR:", err);
    req.flash("error", "Unable to load your incident reports.");
    res.redirect("/safety");
  }
};

// 5. View Specific User Incident Details
exports.getIncidentDetails = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid report ID.");
      return res.redirect("/my-incidents");
    }

    const incident = await Incident.findOne({
      _id: req.params.id,
      user: req.user._id
    }).lean();

    if (!incident) {
      req.flash("error", "Incident report not found or unauthorized.");
      return res.redirect("/my-incidents");
    }

    res.render("tourism/incidentDetails.ejs", {
      incident,
      isAdminView: false
    });
  } catch (err) {
    console.error("VIEW USER INCIDENT ERROR:", err);
    req.flash("error", "Unable to load incident report.");
    res.redirect("/my-incidents");
  }
};
