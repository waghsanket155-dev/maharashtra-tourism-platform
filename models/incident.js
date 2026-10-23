const mongoose = require("mongoose");

const incidentSchema = new mongoose.Schema(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    userName: {
      type: String,
      trim: true,
      default: ""
    },

    userEmail: {
      type: String,
      trim: true,
      default: ""
    },

    userPhone: {
      type: String,
      trim: true,
      default: ""
    },

    incidentType: {
      type: String,
      required: true,
      enum: [
        "medical_emergency",
        "lost_tourist",
        "harassment_safety",
        "accident_injury",
        "unsafe_restricted_area",
        "lost_belongings",
        "other"
      ],
      default: "other"
    },

    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2000
    },

    locationConsent: {
      type: Boolean,
      default: false
    },

    location: {
      address: {
        type: String,
        default: ""
      },
      latitude: {
        type: Number,
        default: null
      },
      longitude: {
        type: Number,
        default: null
      },
      accuracy: {
        type: Number,
        default: null
      },
      capturedAt: {
        type: Date,
        default: null
      }
    },

    contactInfo: {
      phone: {
        type: String,
        trim: true,
        default: ""
      },
      alternateContact: {
        type: String,
        trim: true,
        default: ""
      }
    },

    status: {
      type: String,
      enum: ["Pending", "In Progress", "Resolved", "Rejected"],
      default: "Pending",
      index: true
    },

    adminNotes: {
      type: String,
      trim: true,
      default: ""
    },

    ipAddress: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

// Helper method to format human-readable incident type
incidentSchema.methods.getFormattedType = function () {
  const typeMap = {
    medical_emergency: "Medical Emergency",
    lost_tourist: "Lost or Separated Tourist",
    harassment_safety: "Harassment or Personal Safety",
    accident_injury: "Accident or Injury",
    unsafe_restricted_area: "Unsafe or Restricted Area",
    lost_belongings: "Lost Belongings",
    other: "Other Incident"
  };
  return typeMap[this.incidentType] || "General Incident";
};

// Static helper to generate unique public report ID
incidentSchema.statics.generateReportId = function () {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `SOS-${dateStr}-${randomStr}`;
};

module.exports = mongoose.model("Incident", incidentSchema);
