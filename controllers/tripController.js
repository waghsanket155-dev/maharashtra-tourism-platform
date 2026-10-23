const mongoose = require("mongoose");
const axios = require("axios");
const SavedTrip = require("../models/savetrip.js");
const touristplace = require("../models/destination.js");
const ManualPlanner = require("../models/manualPlanner.js");

// List all trips for current logged-in user
exports.listMyTrips = async (req, res) => {
  try {
    const trips = await SavedTrip.find({
      user: req.user._id
    }).sort({
      createdAt: -1
    });

    res.render("tourism/mytrips.ejs", {
      trips
    });
  } catch (error) {
    console.error("MY TRIPS ERROR:", error);
    req.flash("error", "Unable to load saved trips.");
    return res.redirect("/plan-trip");
  }
};

// View single saved trip
exports.getTrip = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid trip ID.");
      return res.redirect("/my-trips");
    }

    const trip = await SavedTrip.findOne({
      _id: req.params.id,
      user: req.user._id
    }).lean();

    if (!trip) {
      req.flash("error", "Trip not found.");
      return res.redirect("/my-trips");
    }

    res.render("tourism/tripresult.ejs", {
      itinerary: trip,
      isSaved: true
    });
  } catch (error) {
    console.error("VIEW SAVED TRIP ERROR:", error);
    req.flash("error", "Unable to load trip.");
    return res.redirect("/my-trips");
  }
};

// Edit existing saved manual trip form
exports.renderEditTrip = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid trip ID.");
      return res.redirect("/my-trips");
    }

    const trip = await SavedTrip.findOne({
      _id: req.params.id,
      user: req.user._id
    }).lean();

    if (!trip) {
      req.flash("error", "Trip not found or unauthorized.");
      return res.redirect("/my-trips");
    }

    const plannerPlaces = await ManualPlanner
      .find({ user_id: req.user._id })
      .populate("destination_id")
      .sort({ createdAt: -1 });

    const allDestinations = await touristplace.find({}).sort({ name: 1 });
    const categories = [...new Set(allDestinations.map(d => d.category).filter(Boolean))].sort();
    const districts = [...new Set(allDestinations.map(d => d.district).filter(Boolean))].sort();

    res.render("tourism/mplanner.ejs", {
      plannerPlaces: plannerPlaces.filter(p => p.destination_id),
      allDestinations,
      categories,
      districts,
      tripToEdit: trip
    });
  } catch (error) {
    console.error("EDIT TRIP GET ERROR:", error);
    req.flash("error", "Unable to load trip editor.");
    res.redirect("/my-trips");
  }
};

// Update existing saved manual trip
exports.updateTrip = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid trip ID.");
      return res.redirect("/my-trips");
    }

    const trip = await SavedTrip.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!trip) {
      req.flash("error", "Trip not found or unauthorized.");
      return res.redirect("/my-trips");
    }

    let payload = req.body;
    if (req.body.itineraryPayload) {
      try {
        payload = JSON.parse(req.body.itineraryPayload);
      } catch (e) {
        console.error("PAYLOAD JSON PARSE ERROR:", e);
      }
    }

    const { tripName, startingCity, startDate, travelers, budget, notes, summary, days } = payload;

    if (!tripName || !startingCity || !startDate) {
      req.flash("error", "Please provide all required trip details.");
      return res.redirect(`/my-trips/${req.params.id}/edit`);
    }

    if (!days || !Array.isArray(days) || days.length === 0) {
      req.flash("error", "Trip must have at least one day.");
      return res.redirect(`/my-trips/${req.params.id}/edit`);
    }

    let grandTransport = 0;
    let grandFood = 0;
    let grandEntry = 0;
    let grandOther = 0;

    const cleanedDays = days.map((day, idx) => {
      const activities = (day.activities || []).map(act => {
        const tCost = Math.max(0, Number(act.transportCost) || 0);
        const fCost = Math.max(0, Number(act.foodCost) || 0);
        const eCost = Math.max(0, Number(act.entryFee) || 0);
        const oCost = Math.max(0, Number(act.otherCost) || 0);

        grandTransport += tCost;
        grandFood += fCost;
        grandEntry += eCost;
        grandOther += oCost;

        return {
          time: act.time || act.arrivalTime || "",
          arrivalTime: act.arrivalTime || act.time || "",
          departureTime: act.departureTime || "",
          type: act.type || "visit",
          from: act.from || "",
          to: act.to || "",
          place: act.place || "Stop",
          placeId: (act.placeId && mongoose.Types.ObjectId.isValid(act.placeId)) ? act.placeId : undefined,
          duration: act.duration || "",
          description: act.description || act.notes || "",
          notes: act.notes || act.description || "",
          transportMode: act.transportMode || "",
          transportCost: tCost,
          entryFee: eCost,
          foodCost: fCost,
          otherCost: oCost
        };
      });

      return {
        day: Number(day.day) || (idx + 1),
        date: day.date || "",
        title: day.title || `Day ${idx + 1}`,
        activities
      };
    });

    const grandTotal = grandTransport + grandFood + grandEntry + grandOther;

    trip.tripName = tripName.trim();
    trip.title = tripName.trim();
    trip.startingCity = startingCity.trim();
    trip.startDate = startDate;
    trip.travelers = Math.max(1, Number(travelers) || 1);
    trip.budget = Math.max(0, Number(budget) || 0);
    trip.notes = notes ? notes.trim() : "";
    trip.summary = summary ? summary.trim() : `${cleanedDays.length}-day trip from ${startingCity} exploring Maharashtra destinations, for ${travelers} traveler(s) with an estimated cost of ₹${grandTotal.toLocaleString('en-IN')}.`;
    trip.days = cleanedDays;
    trip.estimatedCost = {
      travel: grandTransport,
      food: grandFood,
      entryFees: grandEntry,
      other: grandOther,
      total: grandTotal
    };

    await trip.save();

    console.log("TRIP UPDATED SUCCESSFULLY:", trip._id);
    req.flash("success", "Trip updated successfully! ❤️");
    return res.redirect(`/my-trips/${trip._id}`);

  } catch (error) {
    console.error("UPDATE TRIP ERROR:", error);
    req.flash("error", "Failed to update trip.");
    return res.redirect(`/my-trips/${req.params.id}/edit`);
  }
};

// Delete saved trip
exports.deleteTrip = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid trip ID.");
      return res.redirect("/my-trips");
    }

    const deletedTrip = await SavedTrip.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id
    });

    if (!deletedTrip) {
      req.flash("error", "Trip not found or unauthorized.");
      return res.redirect("/my-trips");
    }

    req.flash("success", "Trip deleted successfully!");
    res.redirect("/my-trips");
  } catch (error) {
    console.error("DELETE SAVED TRIP ERROR:", error);
    req.flash("error", "Failed to delete trip.");
    res.redirect("/my-trips");
  }
};

// Trip Companion Page - Start Trip
exports.startTrip = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash('error', 'Invalid trip ID.');
      return res.redirect('/my-trips');
    }
    const trip = await SavedTrip.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!trip) {
      req.flash('error', 'Trip not found or unauthorized.');
      return res.redirect('/my-trips');
    }
    if (!trip.days || trip.days.length === 0) {
      req.flash('error', 'This trip has no itinerary days. Please edit it first.');
      return res.redirect('/my-trips');
    }

    // Collect placeIds and names from activities across all days
    const placeIds = [];
    const placeNames = [];
    for (const day of trip.days) {
      for (const act of (day.activities || [])) {
        if (act.placeId && mongoose.Types.ObjectId.isValid(String(act.placeId))) {
          placeIds.push(String(act.placeId));
        }
        if (act.place && typeof act.place === 'string') {
          placeNames.push(act.place.trim());
        }
      }
    }
    const placeIdSet = [...new Set(placeIds)];
    const uniquePlaceNames = [...new Set(placeNames)];

    let destinationMap = {};
    const queryConditions = [];
    if (placeIdSet.length > 0) queryConditions.push({ _id: { $in: placeIdSet } });
    if (uniquePlaceNames.length > 0) queryConditions.push({ name: { $in: uniquePlaceNames } });

    if (queryConditions.length > 0) {
      const places = await touristplace
        .find({ $or: queryConditions })
        .select('_id name location geoFence district category images')
        .lean();
      for (const p of places) {
        const placeData = {
          id: p._id.toString(),
          name: p.name,
          district: p.district || '',
          category: p.category || '',
          latitude: p.location?.latitude ?? null,
          longitude: p.location?.longitude ?? null,
          address: p.location?.address || '',
          image: (p.images && p.images.length > 0) ? p.images[0] : null,
          geoFenceEnabled: p.geoFence?.enabled || false,
          geoFenceRadius: p.geoFence?.radius || 300
        };
        destinationMap[p._id.toString()] = placeData;
        if (p.name) {
          destinationMap[p.name.toLowerCase().trim()] = placeData;
        }
      }
    }

    // Mark trip as in_progress if not already started
    if (!trip.tripStatus || trip.tripStatus === 'not_started') {
      await SavedTrip.updateOne(
        { _id: trip._id, user: req.user._id },
        { $set: { tripStatus: 'in_progress', 'tripProgress.startedAt': new Date(), 'tripProgress.lastSavedAt': new Date() } }
      );
      trip.tripStatus = 'in_progress';
    }

    res.render('tourism/tripcompanion.ejs', {
      trip,
      destinationMap,
      destinationMapJSON: JSON.stringify(destinationMap)
    });
  } catch (err) {
    console.error('START TRIP ERROR:', err);
    req.flash('error', 'Unable to load trip companion.');
    return res.redirect('/my-trips');
  }
};

// Save Trip Progress (AJAX)
exports.updateProgress = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid trip ID.' });
    }
    const trip = await SavedTrip.findOne({ _id: req.params.id, user: req.user._id });
    if (!trip) return res.status(404).json({ success: false, error: 'Trip not found.' });

    const { currentDayIndex, currentActivityIndex, completedActivityId, tripStatus } = req.body;
    const setData = { 'tripProgress.lastSavedAt': new Date() };
    const addToSet = {};

    if (currentDayIndex !== undefined) {
      const d = parseInt(currentDayIndex, 10);
      if (!isNaN(d) && d >= 0 && d < trip.days.length) setData['tripProgress.currentDayIndex'] = d;
    }
    if (currentActivityIndex !== undefined) {
      const a = parseInt(currentActivityIndex, 10);
      if (!isNaN(a) && a >= 0) setData['tripProgress.currentActivityIndex'] = a;
    }
    if (completedActivityId && mongoose.Types.ObjectId.isValid(completedActivityId)) {
      addToSet['tripProgress.completedActivityIds'] = completedActivityId;
    }
    if (tripStatus && ['in_progress', 'paused'].includes(tripStatus)) {
      setData.tripStatus = tripStatus;
    }

    const mongoUpdate = { $set: setData };
    if (Object.keys(addToSet).length > 0) mongoUpdate.$addToSet = addToSet;
    await SavedTrip.updateOne({ _id: trip._id, user: req.user._id }, mongoUpdate);

    return res.json({ success: true });
  } catch (err) {
    console.error('SAVE PROGRESS ERROR:', err);
    return res.status(500).json({ success: false, error: 'Failed to save progress.' });
  }
};

// Complete Trip
exports.completeTrip = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(400).json({ success: false, error: 'Invalid trip ID.' });
      req.flash('error', 'Invalid trip ID.');
      return res.redirect('/my-trips');
    }
    const trip = await SavedTrip.findOne({ _id: req.params.id, user: req.user._id });
    if (!trip) {
      if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(404).json({ success: false, error: 'Trip not found.' });
      req.flash('error', 'Trip not found.');
      return res.redirect('/my-trips');
    }
    await SavedTrip.updateOne(
      { _id: trip._id, user: req.user._id },
      { $set: { tripStatus: 'completed', 'tripProgress.completedAt': new Date(), 'tripProgress.lastSavedAt': new Date() } }
    );
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: 'Trip completed!' });
    }
    req.flash('success', 'Congratulations! Your trip is complete! 🎉');
    return res.redirect('/my-trips');
  } catch (err) {
    console.error('COMPLETE TRIP ERROR:', err);
    if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(500).json({ success: false, error: 'Failed to complete trip.' });
    req.flash('error', 'Failed to complete trip.');
    return res.redirect('/my-trips');
  }
};

// Weather API using Open-Meteo (free, no API key required)
exports.getTripWeather = async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ success: false, error: 'Invalid coordinates. Provide valid lat and lon query params.' });
    }
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,precipitation_probability_max&timezone=Asia%2FKolkata&forecast_days=7`;
    const response = await axios.get(weatherUrl, { timeout: 8000 });
    const data = response.data;

    function describeCode(c) {
      const m = { 0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Icy fog',51:'Light drizzle',53:'Moderate drizzle',55:'Dense drizzle',61:'Slight rain',63:'Moderate rain',65:'Heavy rain',71:'Slight snow',73:'Moderate snow',75:'Heavy snow',77:'Snow grains',80:'Slight showers',81:'Moderate showers',82:'Violent showers',85:'Snow showers',86:'Heavy snow showers',95:'Thunderstorm',96:'Thunderstorm + hail',99:'Thunderstorm + heavy hail' };
      return m[c] || `Weather code ${c}`;
    }
    function iconFor(c) {
      if (c <= 1) return '☀️';
      if (c === 2) return '⛅';
      if (c === 3) return '☁️';
      if (c <= 48) return '🌫️';
      if (c <= 55) return '🌦️';
      if (c <= 65) return '🌧️';
      if (c <= 77) return '❄️';
      if (c <= 82) return '🌩️';
      return '⛈️';
    }

    const cur = data.current ? {
      temperature: data.current.temperature_2m,
      feelsLike: data.current.apparent_temperature,
      humidity: data.current.relative_humidity_2m,
      precipitation: data.current.precipitation,
      windSpeed: data.current.wind_speed_10m,
      windDirection: data.current.wind_direction_10m,
      weatherCode: data.current.weather_code,
      description: describeCode(data.current.weather_code),
      icon: iconFor(data.current.weather_code),
      time: data.current.time
    } : null;

    const daily = [];
    if (data.daily && data.daily.time) {
      for (let i = 0; i < data.daily.time.length; i++) {
        daily.push({
          date: data.daily.time[i],
          maxTemp: data.daily.temperature_2m_max[i],
          minTemp: data.daily.temperature_2m_min[i],
          precipitation: data.daily.precipitation_sum[i],
          precipitationProb: data.daily.precipitation_probability_max[i],
          weatherCode: data.daily.weather_code[i],
          description: describeCode(data.daily.weather_code[i]),
          icon: iconFor(data.daily.weather_code[i])
        });
      }
    }

    const warnings = [];
    if (cur) {
      if ([95, 96, 99].includes(cur.weatherCode)) warnings.push({ level: 'danger', text: 'Thunderstorm conditions detected. Exercise caution and seek shelter if outdoors.' });
      else if (cur.weatherCode >= 80 && cur.weatherCode <= 82) warnings.push({ level: 'warning', text: 'Heavy rain showers. Check local conditions before visiting outdoor sites.' });
      else if ([61, 63, 65].includes(cur.weatherCode)) warnings.push({ level: 'warning', text: 'Rainfall in progress. Outdoor visibility may be reduced.' });
      if (cur.temperature > 42) warnings.push({ level: 'warning', text: `Extreme heat: ${cur.temperature}°C. Stay hydrated and avoid strenuous outdoor activity during peak hours.` });
      if (cur.windSpeed > 50) warnings.push({ level: 'warning', text: `High winds: ${cur.windSpeed} km/h. Check local advisories before trekking or visiting coastal areas.` });
    }

    return res.json({ success: true, current: cur, daily, warnings, timezone: data.timezone, units: { temperature: '°C', windSpeed: 'km/h', precipitation: 'mm' } });
  } catch (err) {
    console.error('WEATHER API ERROR:', err.message);
    if (err.code === 'ECONNABORTED') return res.status(504).json({ success: false, error: 'Weather service timed out. Please try again.' });
    return res.status(503).json({ success: false, error: 'Weather data temporarily unavailable.' });
  }
};
