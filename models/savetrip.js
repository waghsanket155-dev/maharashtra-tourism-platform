const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    time: {
      type: String,
      default: ""
    },
    type: {
      type: String,
      default: "visit"
    },
    from: {
      type: String,
      default: ""
    },
    to: {
      type: String,
      default: ""
    },
    place: {
      type: String,
      default: ""
    },
    placeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TouristPlace"
    },
    duration: {
      type: String,
      default: ""
    },
    description: {
      type: String,
      default: ""
    },
    // Enhanced fields for manual itinerary builder
    arrivalTime: {
      type: String,
      default: ""
    },
    departureTime: {
      type: String,
      default: ""
    },
    transportMode: {
      type: String,
      default: ""
    },
    transportCost: {
      type: Number,
      default: 0
    },
    entryFee: {
      type: Number,
      default: 0
    },
    foodCost: {
      type: Number,
      default: 0
    },
    otherCost: {
      type: Number,
      default: 0
    },
    notes: {
      type: String,
      default: ""
    }
  },
  { _id: true }
);

const savedTripSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    tripName: {
      type: String,
      default: "Maharashtra Trip"
    },

    title: {
      type: String,
      default: ""
    },

    tripType: {
      type: String,
      enum: ["ai", "manual"],
      default: "manual"
    },

    startingCity: {
      type: String,
      default: ""
    },

    startDate: {
      type: String,
      default: ""
    },

    travelers: {
      type: Number,
      default: 1
    },

    budget: {
      type: Number,
      default: 0
    },

    notes: {
      type: String,
      default: ""
    },

    summary: {
      type: String,
      default: ""
    },

    days: [
      {
        day: {
          type: Number,
          default: 1
        },
        date: {
          type: String,
          default: ""
        },
        title: {
          type: String,
          default: ""
        },
        activities: [activitySchema]
      }
    ],

    estimatedCost: {
      travel: {
        type: mongoose.Schema.Types.Mixed,
        default: 0
      },
      food: {
        type: mongoose.Schema.Types.Mixed,
        default: 0
      },
      entryFees: {
        type: mongoose.Schema.Types.Mixed,
        default: 0
      },
      other: {
        type: mongoose.Schema.Types.Mixed,
        default: 0
      },
      total: {
        type: mongoose.Schema.Types.Mixed,
        default: 0
      }
    },

    // Smart Trip Companion progress tracking
    tripStatus: {
      type: String,
      enum: ['not_started', 'in_progress', 'paused', 'completed'],
      default: 'not_started'
    },

    tripProgress: {
      currentDayIndex: { type: Number, default: 0 },
      currentActivityIndex: { type: Number, default: 0 },
      completedActivityIds: [{ type: mongoose.Schema.Types.ObjectId }],
      startedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      lastSavedAt: { type: Date, default: null }
    }
  },

  {
    timestamps: true
  }
);

module.exports = mongoose.model("SavedTrip", savedTripSchema);