const mongoose = require("mongoose");
const User = require("./user.js");
const TouristPlace = require("./destination.js");

const manualPlannerSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    destination_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TouristPlace",
        required: true
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Enforce unique destination per user in planner
manualPlannerSchema.index({ user_id: 1, destination_id: 1 }, { unique: true });

module.exports = mongoose.model("ManualPlanner", manualPlannerSchema);
