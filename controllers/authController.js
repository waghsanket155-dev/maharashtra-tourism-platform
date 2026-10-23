const User = require("../models/user.js");

module.exports.renderSignup = (req, res) => {
  res.render("user/signup.ejs");
};

module.exports.signup = async (req, res, next) => {
  try {
    let { username, email, password } = req.body;
    const adduser = new User({
      username,
      email
    });

    const registeruser = await User.register(adduser, password);
    req.login(registeruser, (err) => {
      if (err) {
        return next(err);
      }
      req.flash("success", "user register successfully");
      res.redirect("/home");
    });
  } catch (error) {
    req.flash("error", error.message);
    res.redirect("/signup");
  }
};

module.exports.renderLogin = (req, res) => {
  res.render("user/login.ejs");
};

module.exports.login = (req, res) => {
  req.flash("success", "Welcome back to maharashtra");
  let redirectvariable = res.locals.redirectUrl || "/home";
  res.redirect(redirectvariable);
};

module.exports.logout = (req, res, next) => {
  req.logOut((err) => {
    if (err) {
      return next(err);
    }
    req.flash("success", "user Logout successfully");
    res.redirect("/explore");
  });
};
