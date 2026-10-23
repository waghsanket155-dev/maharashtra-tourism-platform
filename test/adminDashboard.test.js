const mongoose = require('mongoose');
const assert = require('assert');
const User = require('../models/user.js');
const Place = require('../models/destination.js');
const SavedTrip = require('../models/savetrip.js');
const Incident = require('../models/incident.js');
const SafetyZone = require('../models/safetyZone.js');
const { isAdmin, isLoggedIn } = require('../middleware.js');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tourist';

async function runTests() {
  console.log('========================================');
  console.log('--- ADMIN DASHBOARD & BUTTONS TEST SUITE ---');
  console.log('========================================');

  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB.');

  // Test 1: Middleware role authorization checks
  let adminCalled = false;
  const adminReq = { isAuthenticated: () => true, user: { role: 'admin' } };
  isAdmin(adminReq, {}, () => { adminCalled = true; });
  assert.strictEqual(adminCalled, true, 'isAdmin must allow role === "admin"');
  console.log('✅ PASS: isAdmin allows admin users');

  let redirectCalled = false;
  const userReq = { isAuthenticated: () => true, user: { role: 'user' } };
  const mockRes = { redirect: (url) => { redirectCalled = url === '/login'; } };
  isAdmin(userReq, mockRes, () => {});
  assert.strictEqual(redirectCalled, true, 'isAdmin must redirect non-admin users to /login');
  console.log('✅ PASS: isAdmin redirects regular users');

  // Test 2: Destination Creation
  const testPlaceName = `Test Fort ${Date.now()}`;
  const newPlace = new Place({
    name: testPlaceName,
    district: 'Raigad',
    category: 'Historical',
    description: 'Majestic hill fort in Raigad district.',
    images: ['https://example.com/fort.jpg'],
    location: {
      address: 'Raigad, Maharashtra',
      latitude: 18.2345,
      longitude: 73.4421
    },
    rating: 4.8,
    geoFence: {
      enabled: true,
      radius: 1000,
      zoneType: 'tourist_area',
      status: 'verified'
    }
  });
  await newPlace.save();
  assert(newPlace._id, 'Place must be saved with an _id');
  console.log('✅ PASS: Destination successfully saved to database');

  // Test 3: Destination Queries (Dashboard & Places list filters)
  const foundPlace = await Place.findOne({ name: testPlaceName });
  assert.strictEqual(foundPlace.name, testPlaceName);
  assert.strictEqual(foundPlace.district, 'Raigad');
  assert.strictEqual(foundPlace.category, 'Historical');
  console.log('✅ PASS: Destination retrieved by query');

  const distinctDistricts = await Place.distinct('district');
  assert(distinctDistricts.includes('Raigad'), 'Distinct districts must include Raigad');
  console.log(`✅ PASS: Distinct districts aggregation works (${distinctDistricts.length} districts)`);

  // Test 4: Destination Editing
  foundPlace.name = `${testPlaceName} - Updated`;
  foundPlace.rating = 4.9;
  await foundPlace.save();
  const updatedPlace = await Place.findById(foundPlace._id);
  assert.strictEqual(updatedPlace.name, `${testPlaceName} - Updated`);
  assert.strictEqual(updatedPlace.rating, 4.9);
  console.log('✅ PASS: Destination successfully updated');

  // Test 5: Destination Deletion
  await Place.findByIdAndDelete(foundPlace._id);
  const deletedCheck = await Place.findById(foundPlace._id);
  assert.strictEqual(deletedCheck, null);
  console.log('✅ PASS: Destination successfully deleted');

  // Test 6: User Management (Role toggling & deletion)
  const testUserUsername = `testuser_${Date.now()}`;
  const testUser = new User({
    username: testUserUsername,
    email: `${testUserUsername}@example.com`,
    role: 'user'
  });
  await testUser.save();
  assert.strictEqual(testUser.role, 'user');

  // Promote to admin
  testUser.role = 'admin';
  await testUser.save();
  const promotedUser = await User.findById(testUser._id);
  assert.strictEqual(promotedUser.role, 'admin');
  console.log('✅ PASS: User successfully promoted to admin');

  // Demote back to user
  promotedUser.role = 'user';
  await promotedUser.save();
  const demotedUser = await User.findById(testUser._id);
  assert.strictEqual(demotedUser.role, 'user');
  console.log('✅ PASS: User successfully demoted to standard user');

  // Delete user
  await User.findByIdAndDelete(testUser._id);
  const deletedUserCheck = await User.findById(testUser._id);
  assert.strictEqual(deletedUserCheck, null);
  console.log('✅ PASS: User successfully deleted from database');

  // Test 7: Dashboard Aggregations
  const totalPlaces = await Place.countDocuments();
  const totalUsers = await User.countDocuments();
  const totalIncidents = await Incident.countDocuments();
  const totalSafetyZones = await SafetyZone.countDocuments();
  const totalBookings = await SavedTrip.countDocuments();

  console.log(`✅ PASS: Dashboard metrics aggregated:
    - Places: ${totalPlaces}
    - Users: ${totalUsers}
    - Incidents: ${totalIncidents}
    - Safety Zones: ${totalSafetyZones}
    - Saved Trips: ${totalBookings}`);

  await mongoose.disconnect();
  console.log('========================================');
  console.log('ALL ADMIN DASHBOARD UNIT & MODEL TESTS PASSED!');
  console.log('========================================');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
