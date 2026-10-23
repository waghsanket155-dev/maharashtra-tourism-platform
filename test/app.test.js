const mongoose = require('mongoose');
const http = require('http');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tourist';

// Models & Middleware
const User = require('../models/user.js');
const Place = require('../models/destination.js');
const ManualPlanner = require('../models/manualPlanner.js');
const SavedTrip = require('../models/savetrip.js');
const middleware = require('../middleware.js');

let passedTests = 0;
let failedTests = 0;
const results = [];

function assert(condition, message) {
  if (!condition) {
    failedTests++;
    results.push({ status: 'FAIL', message });
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(message);
  } else {
    passedTests++;
    results.push({ status: 'PASS', message });
    console.log(`  ✅ PASS: ${message}`);
  }
}

// HTTP Helper for session cookies & redirects
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

// Helper to extract cookie value
function extractCookie(cookieArray, name = 'connect.sid') {
  for (const c of cookieArray) {
    if (c.startsWith(name)) {
      return c.split(';')[0];
    }
  }
  return null;
}

async function runUnitTests() {
  console.log('\n========================================');
  console.log('--- 1. UNIT TESTS: MIDDLEWARE & MODELS ---');
  console.log('========================================');

  // Middleware isLoggedIn
  let nextCalled = false;
  let redirectedTo = null;
  middleware.isLoggedIn({ isAuthenticated: () => true }, {}, () => { nextCalled = true; });
  assert(nextCalled === true, 'isLoggedIn calls next() when authenticated');

  nextCalled = false;
  middleware.isLoggedIn({ isAuthenticated: () => false }, { redirect: (url) => { redirectedTo = url; } }, () => { nextCalled = true; });
  assert(nextCalled === false && redirectedTo === '/login', 'isLoggedIn redirects to /login when unauthenticated');

  // Middleware isAdmin
  nextCalled = false;
  redirectedTo = null;
  middleware.isAdmin({ isAuthenticated: () => true, user: { role: 'admin' } }, {}, () => { nextCalled = true; });
  assert(nextCalled === true, 'isAdmin calls next() when authenticated and role is admin');

  nextCalled = false;
  middleware.isAdmin({ isAuthenticated: () => true, user: { role: 'user' } }, { redirect: (url) => { redirectedTo = url; } }, () => { nextCalled = true; });
  assert(nextCalled === false && redirectedTo === '/login', 'isAdmin redirects to /login when role is not admin');

  middleware.isAdmin({ isAuthenticated: () => false }, { redirect: (url) => { redirectedTo = url; } }, () => { nextCalled = true; });
  assert(nextCalled === false && redirectedTo === '/login', 'isAdmin redirects to /login when not authenticated');

  // Middleware isredirect
  const mockRes = { locals: {} };
  middleware.isredirect({ session: { redirectUrl: '/test-redirect' } }, mockRes, () => {});
  assert(mockRes.locals.redirectUrl === '/test-redirect', 'isredirect populates res.locals.redirectUrl');

  // Destination Schema check
  const validPlace = new Place({
    name: 'Test Destination',
    district: 'Pune',
    category: 'Historical',
    latitude: 18.5,
    longitude: 73.8
  });
  const placeValidationErr = validPlace.validateSync();
  assert(!placeValidationErr, 'Destination model validates correct category');

  const invalidPlace = new Place({
    name: 'Invalid Destination',
    category: 'NonExistentCategory'
  });
  const invalidErr = invalidPlace.validateSync();
  assert(invalidErr && invalidErr.errors.category, 'Destination model rejects invalid category');
}

async function runE2ETests() {
  console.log('\n========================================');
  console.log('--- 2. E2E TESTS: PUBLIC ENDPOINTS ---');
  console.log('========================================');

  const publicRoutes = [
    { path: '/home', check: 'Tourist' },
    { path: '/explore', check: 'Explore' },
    { path: '/login', check: 'Login' },
    { path: '/signup', check: 'Signup' },
    { path: '/privacy', check: 'Privacy' },
    { path: '/term', check: 'Terms' }
  ];

  for (const route of publicRoutes) {
    const res = await makeRequest(route.path);
    assert(res.status === 200, `GET ${route.path} returns status 200`);
    assert(res.data.toLowerCase().includes(route.check.toLowerCase()), `GET ${route.path} contains expected keyword "${route.check}"`);
  }

  console.log('\n========================================');
  console.log('--- 3. E2E TESTS: ROUTE GUARDS (UNAUTHENTICATED) ---');
  console.log('========================================');

  const protectedRoutes = [
    '/dashboard',
    '/planner',
    '/my-trips',
    '/m-planner'
  ];

  for (const p of protectedRoutes) {
    const res = await makeRequest(p);
    assert(res.status === 302, `GET ${p} returns 302 redirect`);
    assert(res.headers.location === '/login', `GET ${p} redirects to /login`);
  }

  console.log('\n========================================');
  console.log('--- 4. E2E TESTS: AUTHENTICATION FLOW ---');
  console.log('========================================');

  const testUsername = `tester_${Date.now()}`;
  const testEmail = `${testUsername}@example.com`;
  const testPassword = 'Password123!';

  // Test Signup
  const signupPayload = `username=${encodeURIComponent(testUsername)}&email=${encodeURIComponent(testEmail)}&password=${encodeURIComponent(testPassword)}`;
  const signupRes = await makeRequest('/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: signupPayload
  });

  assert(signupRes.status === 302, 'POST /signup responds with 302 redirect');
  assert(signupRes.headers.location === '/home', 'POST /signup redirects to /home');
  const sessionCookie = extractCookie(signupRes.cookies);
  assert(sessionCookie !== null, 'POST /signup returns session cookie (connect.sid)');

  // Verify created user in MongoDB
  const createdUser = await User.findOne({ username: testUsername });
  assert(createdUser !== null, 'User created in database');
  assert(createdUser.email === testEmail, 'User email stored correctly in database');

  // Test Login with valid credentials
  const loginPayload = `username=${encodeURIComponent(testUsername)}&password=${encodeURIComponent(testPassword)}`;
  const loginRes = await makeRequest('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: loginPayload
  });
  assert(loginRes.status === 302, 'POST /login with valid credentials responds with 302');
  const loggedInCookie = extractCookie(loginRes.cookies) || sessionCookie;

  // Test Login with invalid credentials
  const invalidLoginPayload = `username=${encodeURIComponent(testUsername)}&password=WrongPassword`;
  const failLoginRes = await makeRequest('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: invalidLoginPayload
  });
  assert(failLoginRes.status === 302 && failLoginRes.headers.location === '/login', 'POST /login with invalid password redirects back to /login');

  console.log('\n========================================');
  console.log('--- 5. E2E TESTS: AUTHENTICATED USER FEATURES ---');
  console.log('========================================');

  // Fetch sample destination
  const samplePlace = await Place.findOne();
  assert(samplePlace !== null, 'At least one tourist place exists in DB');
  const samplePlaceId = samplePlace._id.toString();

  // GET /touristplaces/:id
  const placeRes = await makeRequest(`/touristplaces/${samplePlaceId}`, { cookie: loggedInCookie });
  assert(placeRes.status === 200, `GET /touristplaces/${samplePlaceId} returns 200 for logged-in user`);
  assert(placeRes.data.includes(samplePlace.name), `GET /touristplaces/${samplePlaceId} renders place name`);

  // Manual Planner: Add Destination
  const addPlannerRes = await makeRequest(`/m-planner/${samplePlaceId}`, { cookie: loggedInCookie });
  assert(addPlannerRes.status === 302, 'GET /m-planner/:id responds with 302');
  assert(addPlannerRes.headers.location === '/explore', 'GET /m-planner/:id redirects to /explore');

  // Manual Planner: View
  const viewPlannerRes = await makeRequest('/m-planner', { cookie: loggedInCookie });
  assert(viewPlannerRes.status === 200, 'GET /m-planner returns 200');
  assert(viewPlannerRes.data.includes(samplePlace.name), 'GET /m-planner renders added destination');

  // Manual Planner: Remove Destination
  const deletePlannerRes = await makeRequest(`/touristplaces/${samplePlaceId}?_method=DELETE`, {
    method: 'POST',
    cookie: loggedInCookie
  });
  assert(deletePlannerRes.status === 302, 'DELETE /touristplaces/:id responds with 302');
  assert(deletePlannerRes.headers.location === '/m-planner', 'DELETE /touristplaces/:id redirects to /m-planner');

  // Verify deletion in database
  const plannerEntry = await ManualPlanner.findOne({ user_id: createdUser._id, destination_id: samplePlace._id });
  assert(plannerEntry === null, 'Destination removed from manual planner in DB');

  // Save Trip: POST /save-trip
  const testItinerary = {
    summary: 'Automated Test 1-Day Trip to Maharashtra',
    days: [
      {
        day: 1,
        title: 'Day 1: Test Exploration',
        activities: [
          {
            time: '09:00 AM',
            type: 'visit',
            place: samplePlace.name,
            placeId: samplePlaceId,
            duration: '2 hours',
            description: 'Automated test activity'
          }
        ]
      }
    ],
    estimatedCost: {
      travel: '500',
      food: '300',
      entryFees: '50',
      total: '850'
    }
  };

  const saveTripPayload = `itinerary=${encodeURIComponent(JSON.stringify(testItinerary))}`;
  const saveTripRes = await makeRequest('/save-trip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: saveTripPayload,
    cookie: loggedInCookie
  });

  assert(saveTripRes.status === 302, 'POST /save-trip responds with 302');
  assert(saveTripRes.headers.location === '/my-trips', `POST /save-trip redirects to /my-trips`);

  // View My Trips: GET /my-trips
  const myTripsRes = await makeRequest('/my-trips', { cookie: loggedInCookie });
  assert(myTripsRes.status === 200, 'GET /my-trips returns 200');
  assert(myTripsRes.data.includes(testItinerary.summary), 'GET /my-trips renders saved trip summary');

  // View Specific Saved Trip: GET /my-trips/:id
  const savedTripDoc = await SavedTrip.findOne({ user: createdUser._id });
  assert(savedTripDoc !== null, 'Saved trip exists in database');
  const viewSingleTripRes = await makeRequest(`/my-trips/${savedTripDoc._id}`, { cookie: loggedInCookie });
  assert(viewSingleTripRes.status === 200, `GET /my-trips/${savedTripDoc._id} returns 200`);
  assert(viewSingleTripRes.data.includes(samplePlace.name), 'Saved trip detail page renders activity place name');

  console.log('\n========================================');
  console.log('--- 6. E2E TESTS: ROLE-BASED ACCESS CONTROL ---');
  console.log('========================================');

  // Non-admin accessing admin dashboard
  const userAdminCheck = await makeRequest('/dashboard', { cookie: loggedInCookie });
  assert(userAdminCheck.status === 302 && userAdminCheck.headers.location === '/login', 'Non-admin user blocked from /dashboard');

  const userPlannerCheck = await makeRequest('/planner', { cookie: loggedInCookie });
  assert(userPlannerCheck.status === 200, 'Logged-in user successfully accesses /planner (status 200)');

  // Promote test user to admin in DB
  await User.updateOne({ _id: createdUser._id }, { role: 'admin' });
  const adminDashboardRes = await makeRequest('/dashboard', { cookie: loggedInCookie });
  assert(adminDashboardRes.status === 200, 'Admin user successfully accesses /dashboard (status 200)');
  assert(adminDashboardRes.data.includes('Dashboard') || adminDashboardRes.data.includes('Places'), '/dashboard renders admin view');

  const adminPlannerRes = await makeRequest('/planner', { cookie: loggedInCookie });
  assert(adminPlannerRes.status === 200, 'Admin user successfully accesses /planner (status 200)');

  console.log('\n========================================');
  console.log('--- 7. E2E TESTS: AI TRIP PLANNER VALIDATION ---');
  console.log('========================================');

  // Test plan-trip validation: invalid start location
  const badLocationPayload = 'start=InvalidCity&interest=Historical&days=2';
  const badLocationRes = await makeRequest('/plan-trip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: badLocationPayload,
    cookie: loggedInCookie
  });
  assert(badLocationRes.status === 400, 'POST /plan-trip with invalid start city returns 400 Bad Request');

  // Test plan-trip validation: missing interests
  const noInterestPayload = 'start=Pune&days=2';
  const noInterestRes = await makeRequest('/plan-trip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: noInterestPayload,
    cookie: loggedInCookie
  });
  assert(noInterestRes.status === 400, 'POST /plan-trip with no interest returns 400 Bad Request');

  console.log('\n========================================');
  console.log('--- 8. E2E TESTS: LOGOUT & CLEANUP ---');
  console.log('========================================');

  // Test logout
  const logoutRes = await makeRequest('/logout', { cookie: loggedInCookie });
  assert(logoutRes.status === 302, 'GET /logout responds with 302');
  assert(logoutRes.headers.location === '/explore', 'GET /logout redirects to /explore');

  // Verify session invalidated
  const postLogoutTripRes = await makeRequest('/my-trips', { cookie: loggedInCookie });
  assert(postLogoutTripRes.status === 302 && postLogoutTripRes.headers.location === '/login', 'Logged-out user cannot access /my-trips');

  // Cleanup DB
  await User.deleteOne({ _id: createdUser._id });
  await SavedTrip.deleteMany({ user: createdUser._id });
  await ManualPlanner.deleteMany({ user_id: createdUser._id });
  console.log('  🧹 Cleaned up test user, trips, and planner data');
}

async function main() {
  console.log('Connecting to MongoDB for testing...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.');

  try {
    await runUnitTests();
    await runE2ETests();
  } catch (err) {
    console.error('\nTest Suite halted with error:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n========================================');
    console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('========================================\n');
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

main();
