const express = require("express");
const router = express.Router();
const passport = require("passport");
const authController = require("../controllers/authController.js");
const { isredirect } = require("../middleware.js");

router.get("/signup", authController.renderSignup);
router.post("/signup", authController.signup);

router.get("/login", authController.renderLogin);
router.post(
  "/login",
  isredirect,
  passport.authenticate("local", { failureRedirect: "/login", failureFlash: true }),
  authController.login
);

router.get("/logout", authController.logout);

module.exports = router;
