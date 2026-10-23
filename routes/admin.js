const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController.js");
const userController = require("../controllers/userController.js");
const incidentController = require("../controllers/incidentController.js");
const safetyZoneController = require("../controllers/safetyZoneController.js");
const { isLoggedIn, isAdmin } = require("../middleware.js");

// Apply admin guard to all routes in this router
router.use(isLoggedIn, isAdmin);

// 1. Admin Dashboard
router.get("/dashboard", adminController.dashboard);

// 2. User Management
router.get("/admin/users", userController.listUsers);
router.post("/admin/users/:id/role", userController.updateUserRole);
router.post("/admin/users/:id/delete", userController.deleteUser);
router.delete("/admin/users/:id", userController.deleteUser);

// 3. Incident Management
router.get("/admin/incidents", incidentController.listIncidents);
router.get("/admin/incidents/:id", incidentController.getIncidentDetails);
router.patch("/admin/incidents/:id/status", incidentController.updateIncidentStatus);
router.post("/admin/incidents/:id/status", incidentController.updateIncidentStatus);

// 4. Safety Zone Management
router.get("/admin/safety-zones", safetyZoneController.listZones);
router.get("/admin/safety-zones/new", safetyZoneController.renderNewForm);
router.post("/admin/safety-zones", safetyZoneController.createZone);
router.get("/admin/safety-zones/:id/edit", safetyZoneController.renderEditForm);
router.post("/admin/safety-zones/:id", safetyZoneController.updateZone);
router.put("/admin/safety-zones/:id", safetyZoneController.updateZone);
router.post("/admin/safety-zones/:id/verify", safetyZoneController.verifyZone);
router.post("/admin/safety-zones/:id/toggle-active", safetyZoneController.toggleActive);
router.post("/admin/safety-zones/:id/delete", safetyZoneController.deleteZone);
router.delete("/admin/safety-zones/:id", safetyZoneController.deleteZone);

module.exports = router;
