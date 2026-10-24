require("dotenv").config();

const express = require("express");
const app = express();
const path = require("path");
const methodoverride = require("method-override");
const flash = require("connect-flash");
const ejsmate = require("ejs-mate");
const passport = require("passport");
const session = require("express-session");

const connectDB = require("./config/db.js");
const configurePassport = require("./config/passport.js");
const routes = require("./routes/index.js");

// View engine setup
app.engine("ejs", ejsmate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static files & Body Parsers
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodoverride("_method"));

// Session configuration
const sessionoption = {
  // store: store,
  secret: process.env.SESSION_SECRET || "ndjfqejiofjew",
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 days
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    httpOnly: true
  }
};

app.use(session(sessionoption));
app.use(flash());

// Passport setup
app.use(passport.initialize());
app.use(passport.session());
configurePassport();

// Flash messages & user context in views
app.use((req, res, next) => {
  res.locals.successmsg = req.flash("success");
  res.locals.errormsg = req.flash("error");
  res.locals.currentlogin = req.user;
  next();
});

// Database connection
connectDB().catch((err) => {
  console.log(err);
});

// Centralized Routing
app.use("/", routes);

// Start server
const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
  console.log("app is listining on post", PORT);
});

module.exports = app;
