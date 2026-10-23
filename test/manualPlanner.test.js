const mongoose = require('mongoose');
const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tourist';

const User = require('../models/user.js');
const Place = require('../models/destination.js');
const ManualPlanner = require('../models/manualPlanner.js');
const SavedTrip = require('../models/savetrip.js');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (!condition) {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(message);
  } else {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  }
}

async function makeRequest(routePath, options = {}) {
  const url = new URL(routePath, BASE_URL);
  const method = options.method || 'GET';
  const headers = options.headers || {};
  const body = options.body;

  if (options.cookie) {
    headers['Cookie'] = options.cookie;
  }

  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method,
      headers,
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let cookies = [];
        const setCookieHeader = res.headers['set-cookie'];
        if (setCookieHeader) {
          cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data,
          cookies
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function extractCookie(cookieArray, name = 'connect.sid') {
  for (const c of cookieArray) {
    if (c.startsWith(name)) {
      return c.split(';')[0];
    }
  }
  return null;
}

async function runManualPlannerTests() {
  console.log('\n========================================');
  console.log('--- MANUAL PLANNER COMPREHENSIVE TESTS ---');
  console.log('========================================');

  // 1. Create two test users to verify authentication and isolation
  const user1Name = `plannerUser1_${Date.now()}`;
  const user2Name = `plannerUser2_${Date.now()}`;
  const userPassword = 'TestPassword123!';

  // User 1 Signup
  const u1SignupPayload = `username=${encodeURIComponent(user1Name)}&email=${encodeURIComponent(user1Name + '@test.com')}&password=${encodeURIComponent(userPassword)}`;
  const u1Res = await makeRequest('/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: u1SignupPayload
  });
  const cookieUser1 = extractCookie(u1Res.cookies);
  const user1Doc = await User.findOne({ username: user1Name });
  assert(cookieUser1 !== null && user1Doc !== null, 'User 1 registered and session established');

  // User 2 Signup
  const u2SignupPayload = `username=${encodeURIComponent(user2Name)}&email=${encodeURIComponent(user2Name + '@test.com')}&password=${encodeURIComponent(userPassword)}`;
  const u2Res = await makeRequest('/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: u2SignupPayload
  });
  const cookieUser2 = extractCookie(u2Res.cookies);
  const user2Doc = await User.findOne({ username: user2Name });
  assert(cookieUser2 !== null && user2Doc !== null, 'User 2 registered and session established');

  // 2. Fetch sample tourist places
  const places = await Place.find().limit(3);
  assert(places.length >= 2, 'Found at least 2 tourist places in DB for testing');
  const place1 = places[0];
  const place2 = places[1];

  // 3. Test: Unauthenticated user adding destination to planner
  const unauthAddRes = await makeRequest(`/m-planner/${place1._id}`, { method: 'POST' });
  assert(unauthAddRes.status === 302 && unauthAddRes.headers.location === '/login', 'Unauthenticated POST /m-planner/:id redirects to /login');

  // 4. Test: User 1 adds destination via POST /m-planner/:id
  const addPlace1Res = await makeRequest(`/m-planner/${place1._id}`, {
    method: 'POST',
    cookie: cookieUser1
  });
  assert(addPlace1Res.status === 302, 'POST /m-planner/:id responds with 302 redirect');
  assert(addPlace1Res.headers.location === '/m-planner', 'POST /m-planner/:id redirects to /m-planner');

  const mpDoc = await ManualPlanner.findOne({ user_id: user1Doc._id, destination_id: place1._id });
  assert(mpDoc !== null, 'Destination successfully recorded in ManualPlanner collection for User 1');

  // 5. Test: Prevent duplicate additions for same user
  const duplicateAddRes = await makeRequest(`/m-planner/${place1._id}`, {
    method: 'POST',
    cookie: cookieUser1
  });
  assert(duplicateAddRes.status === 302, 'Duplicate POST /m-planner/:id handles gracefully with redirect');
  const countDuplicates = await ManualPlanner.countDocuments({ user_id: user1Doc._id, destination_id: place1._id });
  assert(countDuplicates === 1, 'Duplicate destination prevented from entering ManualPlanner');

  // Add place 2 as well
  await makeRequest(`/m-planner/${place2._id}`, { method: 'POST', cookie: cookieUser1 });

  // 6. Test: GET /m-planner renders planner page with selected places and search section
  const plannerPageRes = await makeRequest('/m-planner', { cookie: cookieUser1 });
  assert(plannerPageRes.status === 200, 'GET /m-planner returns status 200');
  assert(plannerPageRes.data.includes(place1.name), 'GET /m-planner renders selected destination 1');
  assert(plannerPageRes.data.includes(place2.name), 'GET /m-planner renders selected destination 2');
  assert(plannerPageRes.data.includes('Manual Trip Planner'), 'GET /m-planner renders manual trip planner heading');
  assert(plannerPageRes.data.includes('Day-Wise Manual Itinerary Builder'), 'GET /m-planner renders itinerary builder');
  assert(plannerPageRes.data.includes('Manual Budget Summary'), 'GET /m-planner renders budget summary section');

  // 7. Test: Save complete manual trip to MongoDB (POST /save-manual-trip)
  const manualItineraryData = {
    tripName: 'Sahyadri Monsoon Weekend Trek',
    startingCity: 'Pune',
    startDate: '2026-11-10',
    travelers: 2,
    budget: 8000,
    notes: 'Carry raincoats, water bottles, and trek pole.',
    summary: 'A 2-day manual heritage adventure starting from Pune.',
    days: [
      {
        day: 1,
        date: '2026-11-10',
        title: 'Fort Exploration and Sunset View',
        activities: [
          {
            time: '08:00 AM',
            arrivalTime: '08:00 AM',
            departureTime: '12:30 PM',
            type: 'visit',
            place: place1.name,
            placeId: place1._id.toString(),
            duration: '4 hours',
            notes: 'Hike to the summit and explore historical gates',
            transportMode: 'Car / Taxi',
            transportCost: 800,
            entryFee: 50,
            foodCost: 400
          }
        ]
      },
      {
        day: 2,
        date: '2026-11-11',
        title: 'Cultural Heritage Walk',
        activities: [
          {
            time: '10:00 AM',
            arrivalTime: '10:00 AM',
            departureTime: '01:00 PM',
            type: 'visit',
            place: place2.name,
            placeId: place2._id.toString(),
            duration: '3 hours',
            notes: 'Guided heritage walk and photography',
            transportMode: 'Auto-Rickshaw',
            transportCost: 300,
            entryFee: 30,
            foodCost: 350
          }
        ]
      }
    ],
    estimatedCost: {
      travel: 1100,
      food: 750,
      entryFees: 80,
      other: 0,
      total: 1930
    }
  };

  const saveManualTripPayload = `itineraryPayload=${encodeURIComponent(JSON.stringify(manualItineraryData))}&tripName=${encodeURIComponent(manualItineraryData.tripName)}&startingCity=Pune&startDate=2026-11-10&travelers=2`;

  const saveManualRes = await makeRequest('/save-manual-trip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: saveManualTripPayload,
    cookie: cookieUser1
  });

  assert(saveManualRes.status === 302, 'POST /save-manual-trip responds with 302 redirect');
  assert(saveManualRes.headers.location === '/my-trips', 'POST /save-manual-trip redirects to /my-trips');

  // Verify SavedTrip in MongoDB
  const savedTripInDb = await SavedTrip.findOne({ user: user1Doc._id, tripName: 'Sahyadri Monsoon Weekend Trek' });
  assert(savedTripInDb !== null, 'Manual trip successfully persisted in SavedTrip collection in MongoDB');
  assert(savedTripInDb.tripType === 'manual', 'Trip correctly tagged as manual tripType');
  assert(savedTripInDb.startingCity === 'Pune', 'Starting city correctly saved');
  assert(savedTripInDb.startDate === '2026-11-10', 'Start date correctly saved');
  assert(savedTripInDb.travelers === 2, 'Traveler count correctly saved');
  assert(savedTripInDb.budget === 8000, 'Planned budget correctly saved');
  assert(savedTripInDb.days.length === 2, 'Both days correctly saved');
  assert(savedTripInDb.days[0].activities[0].place === place1.name, 'Day 1 destination saved correctly');
  assert(savedTripInDb.days[0].activities[0].transportCost === 800, 'Day 1 transport cost saved correctly');
  assert(savedTripInDb.estimatedCost.total === 1930, 'Total cost calculated and stored accurately');

  // 8. Test: GET /my-trips displays saved trip cards with metadata
  const myTripsRes = await makeRequest('/my-trips', { cookie: cookieUser1 });
  assert(myTripsRes.status === 200, 'GET /my-trips returns status 200');
  assert(myTripsRes.data.includes('Sahyadri Monsoon Weekend Trek'), 'My Trips displays trip name');
  assert(myTripsRes.data.includes('Pune'), 'My Trips displays starting city');
  assert(myTripsRes.data.includes('2 Days'), 'My Trips displays duration');
  assert(myTripsRes.data.includes('Manual Plan'), 'My Trips displays Manual Plan badge');

  // 9. Test: GET /my-trips/:id renders full saved trip details
  const tripDetailsRes = await makeRequest(`/my-trips/${savedTripInDb._id}`, { cookie: cookieUser1 });
  assert(tripDetailsRes.status === 200, 'GET /my-trips/:id returns status 200');
  assert(tripDetailsRes.data.includes('Sahyadri Monsoon Weekend Trek'), 'Trip details renders trip title');
  assert(tripDetailsRes.data.includes(place1.name), 'Trip details renders Day 1 place');
  assert(tripDetailsRes.data.includes(place2.name), 'Trip details renders Day 2 place');
  assert(tripDetailsRes.data.includes('Car / Taxi'), 'Trip details renders transport mode');
  assert(tripDetailsRes.data.includes('Estimated Trip Expenses'), 'Trip details renders budget breakdown');

  // 10. Test: Security / Isolation - User 2 cannot access or view User 1's saved trip
  const unauthorizedViewRes = await makeRequest(`/my-trips/${savedTripInDb._id}`, { cookie: cookieUser2 });
  assert(unauthorizedViewRes.status === 302, 'User 2 blocked from viewing User 1 trip (302 redirect)');
  assert(unauthorizedViewRes.headers.location === '/my-trips', 'Redirected back to /my-trips');

  // 11. Test: Edit trip (GET /my-trips/:id/edit and PUT /my-trips/:id)
  const editPageRes = await makeRequest(`/my-trips/${savedTripInDb._id}/edit`, { cookie: cookieUser1 });
  assert(editPageRes.status === 200, 'GET /my-trips/:id/edit returns status 200');
  assert(editPageRes.data.includes('Sahyadri Monsoon Weekend Trek'), 'Edit page pre-populates trip name');

  // Update trip via PUT
  const updatedItineraryData = { ...manualItineraryData, tripName: 'Sahyadri Monsoon Trek - Updated Edition', budget: 9500 };
  const putPayload = `itineraryPayload=${encodeURIComponent(JSON.stringify(updatedItineraryData))}&tripName=${encodeURIComponent(updatedItineraryData.tripName)}&startingCity=Pune&startDate=2026-11-10&travelers=2`;

  const updateTripRes = await makeRequest(`/my-trips/${savedTripInDb._id}?_method=PUT`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: putPayload,
    cookie: cookieUser1
  });

  assert(updateTripRes.status === 302, 'PUT /my-trips/:id responds with 302 redirect');

  const reloadedTrip = await SavedTrip.findById(savedTripInDb._id);
  assert(reloadedTrip.tripName === 'Sahyadri Monsoon Trek - Updated Edition', 'Trip updated in place without duplicate');
  assert(reloadedTrip.budget === 9500, 'Updated budget saved in MongoDB');

  // 12. Test: Remove destination from planner (DELETE /m-planner/:id)
  const removePlaceRes = await makeRequest(`/m-planner/${place1._id}?_method=DELETE`, {
    method: 'POST',
    cookie: cookieUser1
  });
  assert(removePlaceRes.status === 302, 'DELETE /m-planner/:id responds with 302 redirect');
  const removedPlannerDoc = await ManualPlanner.findOne({ user_id: user1Doc._id, destination_id: place1._id });
  assert(removedPlannerDoc === null, 'Destination removed from planner collection');

  // 13. Test: Delete saved trip (DELETE /my-trips/:id)
  const deleteTripRes = await makeRequest(`/my-trips/${savedTripInDb._id}?_method=DELETE`, {
    method: 'POST',
    cookie: cookieUser1
  });
  assert(deleteTripRes.status === 302, 'DELETE /my-trips/:id responds with 302 redirect');
  assert(deleteTripRes.headers.location === '/my-trips', 'Redirected to /my-trips');
  const checkDeletedTrip = await SavedTrip.findById(savedTripInDb._id);
  assert(checkDeletedTrip === null, 'Saved trip permanently removed from MongoDB');

  // 14. Cleanup test users
  await User.deleteMany({ _id: { $in: [user1Doc._id, user2Doc._id] } });
  await ManualPlanner.deleteMany({ user_id: { $in: [user1Doc._id, user2Doc._id] } });
  await SavedTrip.deleteMany({ user: { $in: [user1Doc._id, user2Doc._id] } });
  console.log('  🧹 Cleaned up test accounts, planner entries, and test trips');
}

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.');

  try {
    await runManualPlannerTests();
  } catch (err) {
    console.error('\nManual Planner Test Suite halted with error:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n========================================');
    console.log(`MANUAL PLANNER TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('========================================\n');
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

main();
