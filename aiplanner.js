const place = require("./models/destination.js");
const axios = require("axios");

// =====================================================
// MAHARASHTRA STARTING CITY COORDINATES
// =====================================================

const startCoordinates = {
  Nashik: {
    lat: 19.9975,
    lng: 73.7898
  },

  Mumbai: {
    lat: 19.0760,
    lng: 72.8777
  },

  Pune: {
    lat: 18.5204,
    lng: 73.8567
  },

  "Chhatrapati Sambhajinagar": {
    lat: 19.8762,
    lng: 75.3433
  },

  Nagpur: {
    lat: 21.1458,
    lng: 79.0882
  },

  Kolhapur: {
    lat: 16.7050,
    lng: 74.2433
  }
};


// =====================================================
// HAVERSINE DISTANCE
// =====================================================

function distance(lat1, lon1, lat2, lon2) {

  const R = 6371;

  const dLat =
    (lat2 - lat1) * Math.PI / 180;

  const dLon =
    (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +

    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return R * c;
}


// =====================================================
// ESCAPE REGEX
// =====================================================

function escapeRegex(value) {

  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}


// =====================================================
// MAIN AI PLANNER
// =====================================================

module.exports = async (req, res) => {

  try {

    const {
      start,
      people,
      interest,
      days,
      budget,
      travel,
      season
    } = req.body;


    // =================================================
    // 1. NORMALIZE INPUT
    // =================================================

    const interestArr =
      Array.isArray(interest)
        ? interest.filter(Boolean)
        : [interest].filter(Boolean);

    const tripDays =
      Math.max(
        1,
        Number(days) || 1
      );

    const numberOfPeople =
      Number(people) || 1;


    console.log("\n=================================");
    console.log("AI TRIP PLANNER REQUEST");
    console.log("=================================");

    console.log("Start:", start);
    console.log("People:", numberOfPeople);
    console.log("Interests:", interestArr);
    console.log("Days:", tripDays);
    console.log("Budget:", budget);
    console.log("Travel:", travel);
    console.log("Season:", season);


    // =================================================
    // 2. START LOCATION
    // =================================================

    const startLocation =
      startCoordinates[start];

    if (!startLocation) {

      return res.status(400).json({
        error:
          "Start location coordinates not available."
      });

    }


    // =================================================
    // 3. FIND DESTINATIONS FROM MONGODB
    // =================================================

    if (interestArr.length === 0) {

      return res.status(400).json({
        error:
          "Please select at least one interest."
      });

    }


    const categoryRegex =
      interestArr.map(
        item =>
          new RegExp(
            `^${escapeRegex(item)}$`,
            "i"
          )
      );


    let places =
      await place.find({

        category: {
          $in: categoryRegex
        }

      }).lean();


    console.log(
      "\nMongoDB matching places:",
      places.length
    );


    // =================================================
    // 4. REMOVE PLACES WITHOUT COORDINATES
    // =================================================

   // =================================================
// 4. CHECK AND NORMALIZE COORDINATES
// =================================================

console.log("\n========== SAMPLE MONGODB DOCUMENT ==========");
console.log(JSON.stringify(places[0], null, 2));

places = places
  .map(p => {

    // Support BOTH formats:
    // 1. latitude / longitude
    // 2. location.latitude / location.longitude

    const latitude =
      p.latitude ??
      p.location?.latitude;

    const longitude =
      p.longitude ??
      p.location?.longitude;


    // Remove destinations without coordinates
    if (
      latitude == null ||
      longitude == null
    ) {
      return null;
    }


    if (
      isNaN(Number(latitude)) ||
      isNaN(Number(longitude))
    ) {
      return null;
    }


    const dist =
      distance(
        startLocation.lat,
        startLocation.lng,
        Number(latitude),
        Number(longitude)
      );


    return {

      ...p,

      // Normalize coordinates
      latitude: Number(latitude),
      longitude: Number(longitude),

      distanceFromStart:
        Number(dist.toFixed(1))

    };

  })
  .filter(Boolean);


console.log(
  "Places with valid coordinates:",
  places.length
);
    // =================================================
    // 6. SORT NEAREST FIRST
    // =================================================

    places.sort(
      (a, b) =>
        a.distanceFromStart -
        b.distanceFromStart
    );


    // =================================================
    // 7. TAKE RELEVANT DESTINATIONS FOR TRIP
    // =================================================

    const maxPlaces = Math.min(25, Math.max(10, tripDays * 4 + 2));
    places = places.slice(0, maxPlaces);


    console.log(
      "\n========== DESTINATIONS =========="
    );


    places.forEach(
      (p, index) => {

        console.log(

          `${index + 1}. ` +

          `${p.name} | ` +

          `${p.category} | ` +

          `${p.distanceFromStart} KM | ` +

          `ID: ${p._id}`

        );

      }
    );


    // =================================================
    // 8. IF NO DESTINATION FOUND
    // =================================================

    if (places.length === 0) {

      return res.status(400).json({

        error:
          "No destinations found for the selected interests and starting location."

      });

    }


    // =================================================
    // 9. PREPARE DESTINATION DATA FOR GEMINI
    // =================================================

    const placesForGemini =
      places.map(p => ({

        _id:
          p._id.toString(),

        name:
          p.name,

        district:
          p.district,

        category:
          p.category,

        description:
          (p.description || "").slice(0, 200),

        latitude:
          Number(p.latitude),

        longitude:
          Number(p.longitude),

        rating:
          p.rating ?? null,

        bestTime:
          p.bestTime || "",

        openingTime:
          p.openingTime || "",

        closingTime:
          p.closingTime || "",

        entryFee:
          p.entryFee || null,

        activities:
          p.activities || [],

        nearbyPlaces:
          p.nearbyPlaces || [],

        distanceFromStart:
          p.distanceFromStart

      }));


    console.log(
      "\nDESTINATION COUNT SENT TO GEMINI:",
      placesForGemini.length
    );


    // console.log(
    //   "\n========== DATA SENT TO GEMINI =========="
    // );

    // console.log(
    //   JSON.stringify(
    //     placesForGemini,
    //     null,
    //     2
    //   )
    // );


    // =================================================
    // 10. GEMINI PROMPT
    // =================================================

    const prompt = `

You are an intelligent Maharashtra travel itinerary planner.

Your task is to create a REALISTIC and COMPLETE ${tripDays}-DAY trip itinerary.

==================================================
USER INFORMATION
==================================================

Starting Location:
${start}

Number of People:
${numberOfPeople}

Selected Interests:
${interestArr.join(", ")}

Trip Duration:
${tripDays} days

Budget:
${budget}

Travel Mode:
${travel}

Season:
${season}


==================================================
VERY IMPORTANT DESTINATION RULE
==================================================

You MUST use ONLY destinations from the DESTINATIONS list below.

The DESTINATIONS list is the complete source of truth.

DO NOT create destinations.

DO NOT invent destinations.

DO NOT use generic names such as:

"Local Attraction"

"Historical Site"

"Nature Spot"

"Nearby Place"

"Nashik Local"

"Popular Destination"

"Local Restaurant"

or any other fake destination.


==================================================
PLACE ID RULE
==================================================

Every activity with:

"type": "visit"

MUST contain:

"place"

AND

"placeId"


The placeId MUST be the exact MongoDB "_id"
from DESTINATIONS.


Example:

{
  "type": "visit",
  "place": "Banganga Tank and Walkeshwar Temple",
  "placeId": "6ab4a63a2bb166dfd64f3823"
}


NEVER generate a new ID.

NEVER modify an ID.

NEVER guess an ID.

NEVER use an ID that is not present in DESTINATIONS.


The "place" and "placeId" MUST refer to the SAME destination.


==================================================
COMPLETE DAY RULE
==================================================

Every day MUST be a complete practical travel day.

A normal day should look approximately like:

08:00 AM
Start / travel

09:00 AM
Visit destination

11:00 AM
Continue exploration / activity

01:00 PM
Lunch

02:00 PM
Visit another suitable destination OR continue exploration

04:00 PM
Activity / exploration / rest

06:00 PM
Return travel

07:00 PM
End of day


The exact timing can change according to:

destination opening time

closing time

travel distance

travel mode

season

destination importance


Do NOT use exactly the same timing for every day.


==================================================
DO NOT FORCE DESTINATIONS
==================================================

Do NOT add fake destinations just to make a day look full.

If only one destination is suitable for a day:

Give that destination a longer exploration duration.

Include realistic:

travel

exploration

lunch

rest

activities

return journey


A day can have one major destination.

For example:

Raigad Fort may require most of the day.

Do not add unrelated destinations just to fill the schedule.


==================================================
TRAVEL RULES
==================================================

Use the provided latitude and longitude.

Consider distance between destinations.

Prefer nearby destinations on the same day.

Avoid unnecessary backtracking.

Do not send the user repeatedly between distant locations.

If two destinations are far apart,
include a travel activity between them.


For travel activities use:

"type": "travel"


Example:

{
  "time": "08:00 AM",
  "type": "travel",
  "from": "Nashik",
  "to": "Destination Name",
  "duration": "1 hr 20 min"
}


==================================================
VISIT RULES
==================================================

For every visit:

Use EXACT destination name from DESTINATIONS.

Use EXACT MongoDB _id.

Use realistic exploration duration.

Use information from the destination description and activities.

Do not invent destination-specific facts.


==================================================
OPENING TIME RULE
==================================================

Respect openingTime and closingTime when provided.

Do not schedule a destination before it opens.

Do not schedule a destination after it closes.


==================================================
MEAL RULE
==================================================

Include lunch approximately around:

12:00 PM - 02:00 PM

Include dinner when appropriate for a multi-day trip.

Meal locations can be generic.

Do NOT give a fake tourist destination placeId to meals.


==================================================
TIME RULE
==================================================

Times must be chronological.

For example:

09:00 AM

10:00 AM

12:30 PM

01:30 PM

03:30 PM

06:00 PM

07:30 PM


Do NOT create overlapping activities.


==================================================
MULTI-DAY RULE
==================================================

Create exactly ${tripDays} days.

Day 1 must be complete.

Day 2 must be complete.

Day 3 must be complete.

Continue until Day ${tripDays}.


Do NOT provide only one day when the user requested multiple days.


==================================================
BUDGET RULE
==================================================

Keep estimated cost reasonably close to:

${budget}

Consider:

travel

food

entry fees


Do not claim exact prices if the destination data does not contain them.

Use reasonable estimates.


==================================================
IMPORTANT
==================================================

If DESTINATIONS contains 10 places,
you may select suitable places from those 10.

If DESTINATIONS contains 3 places,
you must plan using those 3 places.

Do NOT invent more places.

If there are not enough destinations for all days,
reuse a suitable major destination only when necessary,
but do not invent a new destination.


==================================================
DESTINATIONS
==================================================

${JSON.stringify(
  placesForGemini,
  null,
  2
)}


==================================================
RETURN ONLY VALID JSON
==================================================

Use exactly this structure:

{
  "summary": "...",

  "days": [

    {
      "day": 1,

      "title": "...",

      "activities": [

        {
          "time": "09:00 AM",
          "type": "travel",
          "from": "...",
          "to": "...",
          "duration": "1 hr 30 min"
        },

        {
          "time": "10:30 AM",
          "type": "visit",
          "place": "EXACT DESTINATION NAME",
          "placeId": "EXACT MONGODB ID",
          "duration": "2 hours",
          "description": "..."
        },

        {
          "time": "01:00 PM",
          "type": "lunch",
          "place": "Lunch",
          "duration": "1 hour"
        },

        {
          "time": "02:00 PM",
          "type": "visit",
          "place": "EXACT DESTINATION NAME",
          "placeId": "EXACT MONGODB ID",
          "duration": "2 hours",
          "description": "..."
        }

      ]
    }

  ],

  "estimatedCost": {

    "travel": "...",

    "food": "...",

    "entryFees": "...",

    "total": "..."

  }
}

`;


    // =================================================
    // 11. GEMINI MODELS (Fastest & Stable First)
    // =================================================
const GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite"
];

    // =================================================
    // 12. GEMINI REQUEST
    // =================================================

    // =====================================================
// CALL SINGLE GEMINI MODEL
// =====================================================

async function callGeminiWithModel(model, prompt) {

  const response = await axios.post(

    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,

    {

      contents: [

        {
          role: "user",

          parts: [
            {
              text: prompt
            }
          ]
        }

      ],

      generationConfig: {

        temperature: 0.2,

        responseMimeType: "application/json"

      }

    },

    {

      timeout: 18000

    }

  );


  return response.data;

}

    // =================================================
    // 13. CALL GEMINI
    // =================================================

    // =====================================================
// GEMINI SMART FALLBACK CALLER
// =====================================================

async function callGemini(prompt) {

  let lastError = null;

  for (const model of GEMINI_MODELS) {

    try {

      console.log("\n=================================");
      console.log(`Trying Gemini model: ${model}`);
      console.log("=================================");

      const data = await callGeminiWithModel(
        model,
        prompt
      );

      console.log(
        `Gemini SUCCESS using model: ${model}`
      );

      return data;

    } catch (error) {

      const status = error.response?.status;

      const message =
        error.response?.data?.error?.message ||
        error.message ||
        "Unknown Gemini error";

      console.log(
        `Gemini ${model} failed: ${status}`
      );

      console.log(
        `Reason: ${message}`
      );

      lastError = error;


      // ===============================================
      // AUTH ERROR
      // ===============================================

      if (
        status === 401 ||
        status === 403
      ) {

        throw new Error(
          "Gemini API key is invalid or does not have permission."
        );

      }


      // ===============================================
      // TRY NEXT MODEL
      // ===============================================

      if (
        status === 404 ||
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504
      ) {

        console.log(
          `Trying next Gemini model...`
        );

        continue;

      }


      // ===============================================
      // UNKNOWN ERROR
      // ===============================================

      console.log(
        `Unknown error from ${model}. Trying next model...`
      );

      continue;

    }

  }


  // ===============================================
  // ALL MODELS FAILED
  // ===============================================

  const finalError = new Error(
    "ALL_GEMINI_MODELS_FAILED"
  );

  finalError.originalError = lastError;

  throw finalError;

}


    // =================================================
    // 14. GET GEMINI RESPONSE
    // =================================================

    const response =
      await callGemini(prompt);


    const geminiText =
      response
        ?.candidates?.[0]
        ?.content?.parts?.[0]
        ?.text;


    if (!geminiText) {

      throw new Error(
        "Gemini returned an empty response."
      );

    }


    // console.log(
    //   "\n========== GEMINI RAW RESPONSE =========="
    // );

    // console.log(
    //   geminiText
    // );


    // =================================================
    // 15. PARSE JSON
    // =================================================

    let itinerary;


    try {

      itinerary =
        JSON.parse(geminiText);

    } catch (error) {

      console.error(
        "Gemini returned invalid JSON:",
        geminiText
      );

      throw new Error(
        "Gemini returned invalid JSON."
      );

    }


    // =================================================
    // 16. CREATE VALID PLACE MAP
    // =================================================

    const validPlaces =
      new Map(

        places.map(
          p => [

            p._id.toString(),

            p.name

          ]
        )

      );


    // =================================================
    // 17. VALIDATE DAYS
    // =================================================

    if (
      !Array.isArray(
        itinerary.days
      )
    ) {

      throw new Error(
        "Gemini did not return days."
      );

    }


    // =================================================
    // 18. EXACT NUMBER OF DAYS
    // =================================================

    if (
      itinerary.days.length !==
      tripDays
    ) {

      throw new Error(

        `Gemini returned ${itinerary.days.length} days instead of ${tripDays} days.`

      );

    }


    // =================================================
    // 19. VALIDATE EACH DAY
    // =================================================

    itinerary.days.forEach(
      (day, dayIndex) => {

        if (
          !Array.isArray(
            day.activities
          )
        ) {

          throw new Error(

            `Day ${dayIndex + 1} has no activities.`

          );

        }


        if (
          day.activities.length < 3
        ) {

          throw new Error(

            `Day ${dayIndex + 1} is incomplete.`

          );

        }

      }
    );


    // =================================================
    // 20. VALIDATE EVERY VISIT
    // =================================================

    for (
      const day of itinerary.days
    ) {

      for (
        const activity
        of day.activities
      ) {

        if (
          activity.type !== "visit"
        ) {

          continue;

        }


        // ---------------------------------------------
        // PLACE ID REQUIRED
        // ---------------------------------------------

        if (
          !activity.placeId
        ) {

          throw new Error(

            `Visit "${activity.place}" is missing placeId.`

          );

        }


        // ---------------------------------------------
        // ID MUST EXIST
        // ---------------------------------------------

        if (
          !validPlaces.has(
            activity.placeId
          )
        ) {

          throw new Error(

            `Invalid placeId returned by Gemini: ${activity.placeId}`

          );

        }


        // ---------------------------------------------
        // CORRECT DESTINATION NAME
        // ---------------------------------------------

        const actualName =
          validPlaces.get(
            activity.placeId
          );


        if (
          activity.place !==
          actualName
        ) {

          console.log(

            `Correcting destination name: ` +

            `${activity.place} → ${actualName}`

          );


          activity.place =
            actualName;

        }

      }

    }


    // =================================================
    // 21. ADD MISSING BASIC INFORMATION
    // =================================================

    itinerary.days =
      itinerary.days.map(
        (day, index) => {

          return {

            ...day,

            day:
              index + 1,

            activities:
              day.activities || []

          };

        }
      );


    // =================================================
    // 22. FINAL LOG
    // =================================================

    console.log(
      "\n================================="
    );

    console.log(
      "FINAL ITINERARY"
    );

    console.log(
      "================================="
    );

    console.log(
      JSON.stringify(
        itinerary,
        null,
        2
      )
    );


    // =================================================
    // 23. SEND RESULT PAGE
    // =================================================

    return res.render(

      "tourism/tripresult.ejs",

      {
        itinerary,
        isSaved: false
      }

    );


  } catch (error) {


    // =================================================
    // ERROR HANDLING
    // =================================================

    console.error(
      "\n========== TRIP PLANNER ERROR =========="
    );


    console.error(
      error.response?.data ||
      error.message
    );


    // -----------------------------------------------
    // GEMINI QUOTA
    // -----------------------------------------------

    if (
      error.isQuota
    ) {

      return res.status(429).json({

        error:
          "Gemini API quota exceeded. Please try again later or check your Gemini API quota."

      });

    }


    // -----------------------------------------------
    // NO DESTINATIONS
    // -----------------------------------------------

    if (
      error.message?.includes(
        "No destinations found"
      )
    ) {

      return res.status(400).json({

        error:
          error.message

      });

    }


    // -----------------------------------------------
    // INVALID ITINERARY
    // -----------------------------------------------

    if (
      error.message?.includes(
        "incomplete"
      ) ||

      error.message?.includes(
        "Invalid placeId"
      ) ||

      error.message?.includes(
        "missing placeId"
      ) ||

      error.message?.includes(
        "instead of"
      )
    ) {

      return res.status(500).json({

        error:
          "AI generated an incomplete or invalid itinerary. Please try again."

      });

    }


    // -----------------------------------------------
    // GENERAL ERROR
    // -----------------------------------------------

    return res.status(500).json({

      error:
        "Failed to generate trip plan."

    });

  }

};