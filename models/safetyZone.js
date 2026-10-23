const mongoose = require("mongoose");

const safetyZoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Zone name is required."],
      trim: true,
      minlength: [2, "Zone name must be at least 2 characters long."],
      maxlength: [150, "Zone name cannot exceed 150 characters."]
    },

    district: {
      type: String,
      required: [true, "District is required."],
      trim: true,
      maxlength: [80, "District name cannot exceed 80 characters."]
    },

    latitude: {
      type: Number,
      required: [true, "Latitude is required."],
      min: [-90, "Latitude must be between -90 and 90."],
      max: [90, "Latitude must be between -90 and 90."],
      validate: {
        validator: v => typeof v === "number" && !isNaN(v),
        message: "Latitude must be a valid number."
      }
    },

    longitude: {
      type: Number,
      required: [true, "Longitude is required."],
      min: [-180, "Longitude must be between -180 and 180."],
      max: [180, "Longitude must be between -180 and 180."],
      validate: {
        validator: v => typeof v === "number" && !isNaN(v),
        message: "Longitude must be a valid number."
      }
    },

    radius: {
      type: Number,
      required: [true, "Radius in meters is required."],
      min: [5, "Radius must be at least 5 meters."],
      max: [100000, "Radius cannot exceed 100,000 meters."],
      validate: {
        validator: v => typeof v === "number" && !isNaN(v) && v > 0,
        message: "Radius must be a positive number."
      }
    },

    zoneType: {
      type: String,
      required: [true, "Zone type is required."],
      enum: {
        values: ["restricted_area", "caution_zone", "safe_zone"],
        message: "Zone type must be restricted_area, caution_zone, or safe_zone."
      },
      index: true
    },

    restrictedReason: {
      type: String,
      trim: true,
      default: "",
      maxlength: [1000, "Restricted reason cannot exceed 1000 characters."],
      validate: {
        validator: function (v) {
          if ((this.zoneType === "restricted_area" || this.zoneType === "caution_zone") && (!v || v.trim().length === 0)) {
            return false;
          }
          return true;
        },
        message: "Restricted reason is mandatory for restricted areas and caution zones."
      }
    },

    sourceName: {
      type: String,
      required: [true, "Official source name is required."],
      trim: true,
      maxlength: [200, "Source name cannot exceed 200 characters."]
    },

    sourceUrl: {
      type: String,
      required: [true, "Official source URL is required."],
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return false;
          try {
            const url = new URL(v);
            return url.protocol === "http:" || url.protocol === "https:";
          } catch (e) {
            return false;
          }
        },
        message: "Source URL must be a valid HTTP or HTTPS URL."
      }
    },

    notificationNumber: {
      type: String,
      trim: true,
      default: "",
      maxlength: [150, "Notification reference number cannot exceed 150 characters."]
    },

    verificationStatus: {
      type: String,
      enum: {
        values: ["pending", "verified", "rejected"],
        message: "Status must be pending, verified, or rejected."
      },
      default: "pending",
      index: true
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    validFrom: {
      type: Date,
      default: null
    },

    validUntil: {
      type: Date,
      default: null,
      validate: {
        validator: function (v) {
          if (v && this.validFrom && v < this.validFrom) {
            return false;
          }
          return true;
        },
        message: "validUntil must be on or after validFrom."
      }
    },

    geometry: {
      type: {
        type: String,
        enum: ["Polygon", "Point"],
        default: "Point"
      },
      coordinates: {
        type: mongoose.Schema.Types.Mixed,
        default: null
      }
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    verifiedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Compound index for public active query efficiency
safetyZoneSchema.index({ isActive: 1, verificationStatus: 1, validFrom: 1, validUntil: 1 });

// Helper to determine if a zone is currently active & valid
safetyZoneSchema.methods.isCurrentlyValid = function () {
  if (!this.isActive || this.verificationStatus !== "verified") {
    return false;
  }
  const now = new Date();
  if (this.validFrom && now < this.validFrom) return false;
  if (this.validUntil && now > this.validUntil) return false;
  return true;
};

// Static helper to query all currently active and verified zones
safetyZoneSchema.statics.findActiveVerified = function () {
  const now = new Date();
  return this.find({
    isActive: true,
    verificationStatus: "verified",
    $and: [
      { $or: [{ validFrom: null }, { validFrom: { $lte: now } }] },
      { $or: [{ validUntil: null }, { validUntil: { $gte: now } }] }
    ]
  }).sort({ updatedAt: -1 });
};

const SafetyZone = mongoose.model("SafetyZone", safetyZoneSchema);

module.exports = SafetyZone;
