const mongoose = require("mongoose");
const Incident = require("../models/incident.js");

// 6. Admin Incidents Management Dashboard
exports.listIncidents = async (req, res) => {
  try {
    const statusFilter = req.query.status || "all";
    const typeFilter = req.query.type || "all";

    const query = {};
    if (statusFilter !== "all") {
      query.status = statusFilter;
    }
    if (typeFilter !== "all") {
      query.incidentType = typeFilter;
    }

    const incidents = await Incident.find(query)
      .populate("user", "username email")
      .sort({ createdAt: -1 })
      .lean();

    const total = await Incident.countDocuments();
    const pending = await Incident.countDocuments({ status: "Pending" });
    const inProgress = await Incident.countDocuments({ status: "In Progress" });
    const resolved = await Incident.countDocuments({ status: "Resolved" });
    const rejected = await Incident.countDocuments({ status: "Rejected" });

    res.render("admin/incidents.ejs", {
      incidents,
      stats: { total, pending, inProgress, resolved, rejected },
      currentStatusFilter: statusFilter,
      currentTypeFilter: typeFilter
    });
  } catch (err) {
    console.error("ADMIN INCIDENTS ERROR:", err);
    req.flash("error", "Unable to load incidents dashboard.");
    res.redirect("/dashboard");
  }
};

// 7. Admin View Specific Incident Report Details
exports.getIncidentDetails = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid report ID.");
      return res.redirect("/admin/incidents");
    }

    const incident = await Incident.findById(req.params.id)
      .populate("user", "username email")
      .lean();

    if (!incident) {
      req.flash("error", "Incident report not found.");
      return res.redirect("/admin/incidents");
    }

    res.render("tourism/incidentDetails.ejs", {
      incident,
      isAdminView: true
    });
  } catch (err) {
    console.error("ADMIN VIEW INCIDENT ERROR:", err);
    req.flash("error", "Unable to load incident details.");
    res.redirect("/admin/incidents");
  }
};

// 8. Admin Update Incident Status & Internal Notes (Supports both PATCH and POST)
exports.updateIncidentStatus = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(400).json({ success: false, error: "Invalid report ID." });
      }
      req.flash("error", "Invalid report ID.");
      return res.redirect("/admin/incidents");
    }

    const { status, adminNotes } = req.body;
    const allowedStatuses = ["Pending", "In Progress", "Resolved", "Rejected"];

    if (!allowedStatuses.includes(status)) {
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(400).json({ success: false, error: "Invalid status value." });
      }
      req.flash("error", "Invalid status value.");
      return res.redirect(`/admin/incidents/${req.params.id}`);
    }

    const updateData = { status };
    if (typeof adminNotes === "string") {
      updateData.adminNotes = adminNotes.trim();
    }

    const updatedIncident = await Incident.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updatedIncident) {
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(404).json({ success: false, error: "Incident report not found." });
      }
      req.flash("error", "Incident report not found.");
      return res.redirect("/admin/incidents");
    }

    console.log(`INCIDENT [${updatedIncident.reportId}] status updated to ${status} by admin ${req.user._id}`);

    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.json({ success: true, incident: updatedIncident });
    }

    req.flash("success", `Incident status updated to "${status}".`);
    return res.redirect(`/admin/incidents/${req.params.id}`);
  } catch (err) {
    console.error("UPDATE INCIDENT STATUS ERROR:", err);
    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.status(500).json({ success: false, error: "Failed to update incident status." });
    }
    req.flash("error", "Failed to update incident status.");
    return res.redirect("/admin/incidents");
  }
};
