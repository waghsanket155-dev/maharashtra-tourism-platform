const mongoose = require("mongoose");
const SafetyZone = require("../models/safetyZone.js");

const initialSafetyZones = [
  {
    name: "Sanjay Gandhi National Park Core Wildlife Zone",
    district: "Mumbai Suburban",
    latitude: 19.2288,
    longitude: 72.9182,
    radius: 2500,
    zoneType: "restricted_area",
    restrictedReason: "Core wildlife protected forest habitat. General tourist access restricted to designated ecotourism areas (Kanheri / Silvonda). Entry into interior core forest without forest department written permit is prohibited under Wildlife Protection Act 1972.",
    sourceName: "Ministry of Environment, Forest and Climate Change (MoEFCC)",
    sourceUrl: "https://moef.gov.in/esz-notifications",
    notificationNumber: "MoEFCC Notification S.O. 3645(E) dated 05-12-2016",
    verificationStatus: "verified",
    isActive: true,
    geometry: {
      type: "Point",
      coordinates: [72.9182, 19.2288]
    }
  },
  {
    name: "Bhimashankar Wildlife Sanctuary Core Forest",
    district: "Pune",
    latitude: 19.0722,
    longitude: 73.5358,
    radius: 2000,
    zoneType: "restricted_area",
    restrictedReason: "Giant Squirrel (Shekru) core breeding habitat & inviolate wildlife reserve. Entry off the temple pilgrimage road into core forest compartments without forest guard escort or permit is prohibited.",
    sourceName: "Wildlife Institute of India & Maharashtra Forest Department",
    sourceUrl: "https://v1.wii.gov.in/protectedareagazette_maharashtra",
    notificationNumber: "Govt of Maharashtra Gazette Notification WLP/1084/CR-146/F-1",
    verificationStatus: "verified",
    isActive: true,
    geometry: {
      type: "Point",
      coordinates: [73.5358, 19.0722]
    }
  },
  {
    name: "Tamhini Wildlife Sanctuary & Ghat Monsoon Hazard Corridor",
    district: "Pune",
    latitude: 18.4530,
    longitude: 73.4258,
    radius: 1500,
    zoneType: "caution_zone",
    restrictedReason: "Steep mountain ghat corridor with severe landslide risk, dense fog, waterfall flash-flood currents, and unbarricaded drop-offs. Night driving caution and strict adherence to designated viewpoints advised.",
    sourceName: "Maharashtra Tourism Development Corporation (MTDC) & District Disaster Management",
    sourceUrl: "https://maharashtratourism.gov.in/",
    notificationNumber: "DDMA Pune Monsoon Travel Advisory / Forest Dept WLP-0812/CR-88/F-1",
    verificationStatus: "verified",
    isActive: true,
    geometry: {
      type: "Point",
      coordinates: [73.4258, 18.4530]
    }
  },
  {
    name: "Tadoba-Andhari Tiger Reserve (TATR) Inviolate Core",
    district: "Chandrapur",
    latitude: 20.2185,
    longitude: 79.3039,
    radius: 3000,
    zoneType: "restricted_area",
    restrictedReason: "Critical tiger breeding core habitat. Strictly off-limits to private vehicles and pedestrian tourists; tourist access restricted to licensed gypsy safaris on designated safari tracks during official time slots.",
    sourceName: "Maharashtra Forest Department - Project Tiger",
    sourceUrl: "https://mahaforest.gov.in/",
    notificationNumber: "Maharashtra Forest Dept Notification No. WLP-1006/CR-44/F-1",
    verificationStatus: "verified",
    isActive: true,
    geometry: {
      type: "Point",
      coordinates: [79.3039, 20.2185]
    }
  },
  {
    name: "Kaas Plateau (Kas Pathar) Regulated Eco-Reserve",
    district: "Satara",
    latitude: 17.7208,
    longitude: 73.8197,
    radius: 1200,
    zoneType: "caution_zone",
    restrictedReason: "UNESCO World Natural Heritage site with vulnerable endemic flora. Entry restricted to daily visitor quotas with mandatory walking on designated wooden pathways; stepping onto fragile flower beds is strictly prohibited.",
    sourceName: "Maharashtra Forest Department & Joint Forest Management Committee (JFMC)",
    sourceUrl: "https://mahaforest.gov.in/",
    notificationNumber: "Satara Forest Division Kas Conservation Protocol 2012",
    verificationStatus: "verified",
    isActive: true,
    geometry: {
      type: "Point",
      coordinates: [73.8197, 17.7208]
    }
  },
  {
    name: "Purandar Fort Military Cantonment Perimeter",
    district: "Pune",
    latitude: 18.2778,
    longitude: 73.9788,
    radius: 700,
    zoneType: "restricted_area",
    restrictedReason: "Summit sector shared with active Indian Armed Forces military establishment. Photography prohibited; civilian access restricted beyond the designated lower monument boundary.",
    sourceName: "Ministry of Defence / Southern Command & Maharashtra Tourism",
    sourceUrl: "https://maharashtratourism.gov.in/",
    notificationNumber: "Defence Cantonment Security Order - Southern Command",
    verificationStatus: "verified",
    isActive: true,
    geometry: {
      type: "Point",
      coordinates: [73.9788, 18.2778]
    }
  },
  {
    name: "Gateway of India Tourist Safety Zone",
    district: "Mumbai City",
    latitude: 18.9220,
    longitude: 72.8347,
    radius: 500,
    zoneType: "safe_zone",
    restrictedReason: "",
    sourceName: "Maharashtra Tourism Development Corporation (MTDC) & Mumbai Police",
    sourceUrl: "https://maharashtratourism.gov.in/",
    notificationNumber: "MTDC Tourist Facilitation & Safety Zone Protocol",
    verificationStatus: "verified",
    isActive: true,
    geometry: {
      type: "Point",
      coordinates: [72.8347, 18.9220]
    }
  },
  {
    name: "Koyna Wildlife Sanctuary Buffer (Awaiting Officer Review)",
    district: "Satara",
    latitude: 17.3980,
    longitude: 73.7420,
    radius: 2000,
    zoneType: "caution_zone",
    restrictedReason: "Buffer boundary coordinates and permitted trekking corridors awaiting official Forest Range Officer ground demarcation.",
    sourceName: "Maharashtra Forest Department",
    sourceUrl: "https://mahaforest.gov.in/",
    notificationNumber: "MoEFCC Draft ESZ S.O. 1290(E) - Pending Final Demarcation",
    verificationStatus: "pending",
    isActive: true,
    geometry: {
      type: "Point",
      coordinates: [73.7420, 17.3980]
    }
  }
];

async function seedSafetyZones() {
  const count = await SafetyZone.countDocuments();
  if (count === 0) {
    console.log("Seeding initial authentic Maharashtra Safety Zones...");
    await SafetyZone.insertMany(initialSafetyZones);
    console.log(`Seeded ${initialSafetyZones.length} safety zones successfully.`);
  }
}

module.exports = {
  initialSafetyZones,
  seedSafetyZones
};
