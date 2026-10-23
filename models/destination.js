const mongoose = require("mongoose");

const touristPlaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
   
      trim: true
    },

    district: {
      type: String,
      
      trim: true
    },

    category: {
      type: String,
  
      enum: [
        "Historical",
        "Religious",
        "Nature",
        "Wildlife",
        "Park / Garden",
        "Museum",
        "Beach",
        "Adventure",
        "Family",
         "Park / Family",
         "Leisure",
         "Trekking",
         `Wellness`,
         'Cultural',
        `Hill Station`
      ]
    },

    description: {
      type: String
      
    },

    images: {
      type: [String],
    },

    location: {
      address: {
        type: String,
        
      },

      latitude: {
        type: Number,
      },

      longitude: {
        type: Number,
      }
    },

    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: null
    },

    bestTime: {
      type: String,
      default: null
    },

    openingTime: {
      type: String,
      default: null
    },

    closingTime: {
      type: String,
      default: null
    },

    entryFee: {
      indian: {
        type: Number,
        default: null
      },

      foreign: {
        type: Number,
        default: null
      },

      currency: {
        type: String,
        default: "INR"
      },

      notes: {
        type: String,
        default: ""
      }
    },

    activities: {
      type: [String],
      default: []
    },

    nearbyPlaces: {
      type: [String],
      default: []
    },

    geoFence: {
      enabled: {
        type: Boolean,
        default: false
      },

      radius: {
        type: Number,
        default: null
      },

      zoneType: {
        type: String,
        default: "tourist_area"
      },

      status: {
        type: String,
        enum: [
          "verified",
          "unverified",
          "restricted"
        ],
        default: "unverified"
      },

      restrictedReason: {
        type: String,
        default: ""
      }
    }
,
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }  },
  {
    timestamps: true
  }
);

const TouristPlace = mongoose.model(
  "TouristPlace",
  touristPlaceSchema
);

module.exports = TouristPlace;