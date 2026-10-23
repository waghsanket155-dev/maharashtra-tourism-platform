const mongoose = require("mongoose");
const User = require("../models/user.js");

module.exports.listUsers = async (req, res) => {
  try {
    const search = (req.query.search || "").trim();
    const role = (req.query.role || "all").trim();

    const filter = {};
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ];
    }
    if (role && role !== "all") {
      filter.role = role;
    }

    const users = await User.find(filter).sort({ _id: -1 });
    const totalUsers = await User.countDocuments();
    const adminCount = await User.countDocuments({ role: "admin" });
    const regularUsersCount = totalUsers - adminCount;

    res.render("admin/users.ejs", {
      users,
      totalUsers,
      adminCount,
      regularUsersCount,
      currentRole: role,
      search
    });
  } catch (err) {
    console.error("ADMIN USERS ERROR:", err);
    req.flash("error", "Unable to load user management.");
    res.redirect("/dashboard");
  }
};

module.exports.updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash("error", "Invalid user ID.");
      return res.redirect("/admin/users");
    }

    if (req.user._id.toString() === id) {
      req.flash("error", "You cannot modify your own administrative role.");
      return res.redirect("/admin/users");
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      req.flash("error", "User not found.");
      return res.redirect("/admin/users");
    }

    const newRole = req.body.role === "admin" ? "admin" : "user";
    targetUser.role = newRole;
    await targetUser.save();

    req.flash("success", `User "${targetUser.username}" role updated to ${newRole}.`);
    res.redirect("/admin/users");
  } catch (err) {
    console.error("ADMIN USER ROLE ERROR:", err);
    req.flash("error", "Failed to update user role.");
    res.redirect("/admin/users");
  }
};

module.exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash("error", "Invalid user ID.");
      return res.redirect("/admin/users");
    }

    if (req.user._id.toString() === id) {
      req.flash("error", "You cannot delete your own admin account.");
      return res.redirect("/admin/users");
    }

    const deletedUser = await User.findByIdAndDelete(id);
    if (!deletedUser) {
      req.flash("error", "User not found.");
      return res.redirect("/admin/users");
    }

    req.flash("success", `User "${deletedUser.username}" account deleted successfully.`);
    res.redirect("/admin/users");
  } catch (err) {
    console.error("ADMIN USER DELETE ERROR:", err);
    req.flash("error", "Failed to delete user.");
    res.redirect("/admin/users");
  }
};
