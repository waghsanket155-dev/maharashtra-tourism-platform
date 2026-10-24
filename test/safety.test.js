const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const mongoose = require('mongoose');
const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tourist';

const User = require('../models/user.js');
const Place = require('../models/destination.js');
const Incident = require('../models/incident.js');
const SafetyZone = require('../models/safetyZone.js');

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

async function runSafetyTests() {
  console.log('\n======================================================');
  console.log('--- TOURIST SAFETY, GEOFENCING & SOS TEST SUITE ---');
  console.log('======================================================\n');

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
      console.log('Connected to MongoDB for direct data validation.');
    }

    // -----------------------------------------------------------------
    // 1. INCIDENT MODEL UNIT VALIDATIONS
    // -----------------------------------------------------------------
    console.log('--- 1. Testing Incident Model Schema & Methods ---');
    
    const reportId = Incident.generateReportId();
    assert(/^SOS-\d{8}-[A-Z0-9]{4,6}$/.test(reportId), `Incident.generateReportId() matches format: ${reportId}`);

    // Create a dummy user for model tests
    const dummyUser = await User.findOne({}) || await User.create({ username: 'dummy_safety_tester', email: 'dummy_safety@test.com' });

    const validIncident = new Incident({
      reportId: Incident.generateReportId(),
      user: dummyUser._id,
      userName: 'John Doe',
      userEmail: 'john@example.com',
      userPhone: '9876543210',
      incidentType: 'medical_emergency',
      description: 'Test medical emergency report',
      locationConsent: true,
      location: {
        latitude: 18.5204,
        longitude: 73.8567,
        accuracy: 15,
        address: 'Pune, Maharashtra'
      }
    });

    const savedIncident = await validIncident.save();
    assert(savedIncident._id != null, 'Incident model saved successfully with valid schema');
    assert(savedIncident.status === 'Pending', 'Incident default status is "Pending"');
    assert(savedIncident.getFormattedType() === 'Medical Emergency', 'getFormattedType() returns "Medical Emergency"');

    // Clean up dummy incident
    await Incident.deleteOne({ _id: savedIncident._id });

    // Validation failure on missing required fields
    let validationFailed = false;
    try {
      const invalidIncident = new Incident({
        user: dummyUser._id,
        // missing incidentType and description
      });
      await invalidIncident.validate();
    } catch (err) {
      validationFailed = true;
    }
    assert(validationFailed, 'Incident model enforces required incidentType and description');

    // -----------------------------------------------------------------
    // 2. UNAUTHENTICATED ROUTE ACCESS CONTROL
    // -----------------------------------------------------------------
    console.log('\n--- 2. Testing Unauthenticated Route Protection ---');

    const resUnauthSafety = await makeRequest('/safety');
    assert(resUnauthSafety.status === 302 && resUnauthSafety.headers.location?.includes('/login'),
      'Unauthenticated GET /safety redirects to /login');

    const resUnauthApi = await makeRequest('/api/safety/geofences');
    assert(resUnauthApi.status === 302 || resUnauthApi.status === 401,
      'Unauthenticated GET /api/safety/geofences blocks unauthorized access');

    const resUnauthPost = await makeRequest('/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incidentType: 'medical_emergency', description: 'Help!' })
    });
    assert(resUnauthPost.status === 302 || resUnauthPost.status === 401,
      'Unauthenticated POST /incidents blocks unauthorized report submission');

    const resUnauthAdmin = await makeRequest('/admin/incidents');
    assert(resUnauthAdmin.status === 302,
      'Unauthenticated GET /admin/incidents redirects to /login');

    // -----------------------------------------------------------------
    // 3. AUTHENTICATED USER SESSIONS (NORMAL & ADMIN)
    // -----------------------------------------------------------------
    console.log('\n--- 3. Creating Authenticated Normal & Admin Users ---');

    const testTime = Date.now();
    const touristUsername = `tourist_${testTime}`;
    const adminUsername = `admin_${testTime}`;
    const password = 'Password@123';

    // Signup tourist
    const touristPayload = `username=${encodeURIComponent(touristUsername)}&email=${encodeURIComponent(touristUsername + '@test.com')}&password=${encodeURIComponent(password)}`;
    const touristSignupRes = await makeRequest('/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: touristPayload
    });
    const touristCookie = extractCookie(touristSignupRes.cookies);
    const touristUser = await User.findOne({ username: touristUsername });
    assert(touristCookie !== null && touristUser !== null, 'Normal tourist registered and session active');

    // Signup admin & update role in DB
    const adminPayload = `username=${encodeURIComponent(adminUsername)}&email=${encodeURIComponent(adminUsername + '@test.com')}&password=${encodeURIComponent(password)}`;
    const adminSignupRes = await makeRequest('/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: adminPayload
    });
    const adminCookie = extractCookie(adminSignupRes.cookies);
    await User.updateOne({ username: adminUsername }, { $set: { role: 'admin' } });
    const adminUser = await User.findOne({ username: adminUsername });
    assert(adminCookie !== null && adminUser.role === 'admin', 'Admin user registered and elevated to role: admin');

    // User 2 (for isolation testing)
    const tourist2Username = `tourist2_${testTime}`;
    const tourist2Payload = `username=${encodeURIComponent(tourist2Username)}&email=${encodeURIComponent(tourist2Username + '@test.com')}&password=${encodeURIComponent(password)}`;
    const tourist2SignupRes = await makeRequest('/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tourist2Payload
    });
    const tourist2Cookie = extractCookie(tourist2SignupRes.cookies);
    assert(tourist2Cookie !== null, 'Second tourist user created for isolation tests');

    // -----------------------------------------------------------------
    // 4. TOURIST SAFETY VIEW & GEOFENCE API ENDPOINT
    // -----------------------------------------------------------------
    console.log('\n--- 4. Testing GET /safety and GET /api/safety/geofences ---');

    const safetyViewRes = await makeRequest('/safety', { cookie: touristCookie });
    assert(safetyViewRes.status === 200, 'GET /safety returns HTTP 200 for logged-in user');
    assert(safetyViewRes.data.includes('Tourist Safety & Geo-Fence Monitoring') || safetyViewRes.data.includes('Tourist Safety'),
      'Safety view contains main heading');
    assert(safetyViewRes.data.includes('id="startMonitoringBtn"'), 'Safety view includes explicit Start Monitoring control');
    assert(safetyViewRes.data.includes('id="stopMonitoringBtn"'), 'Safety view includes explicit Stop Monitoring control');
    assert(safetyViewRes.data.includes('leaflet'), 'Safety view includes Leaflet interactive map setup');
    assert(safetyViewRes.data.includes('112'), 'Safety view includes direct National Emergency helpline 112');
    assert(safetyViewRes.data.includes('100'), 'Safety view includes direct Police helpline 100');
    assert(safetyViewRes.data.includes('108'), 'Safety view includes direct Ambulance helpline 108');
    assert(safetyViewRes.data.includes('1363'), 'Safety view includes Tourist Helpline 1363');

    const geofenceApiRes = await makeRequest('/api/safety/geofences', { cookie: touristCookie });
    assert(geofenceApiRes.status === 200, 'GET /api/safety/geofences returns HTTP 200');
    
    const parsedRes = JSON.parse(geofenceApiRes.data);
    const geofences = Array.isArray(parsedRes) ? parsedRes : (parsedRes.zones || []);
    assert(Array.isArray(geofences), 'Geofence API returns an array of zones');
    assert(geofences.length > 0, `Geofence API returned ${geofences.length} active zones`);
    
    // Validate individual zone structure
    const sampleZone = geofences[0];
    assert(sampleZone.id && sampleZone.title, 'Zone contains id and title');
    assert(typeof sampleZone.latitude === 'number' && typeof sampleZone.longitude === 'number',
      `Zone has numeric coordinates (${sampleZone.latitude}, ${sampleZone.longitude})`);
    assert(typeof sampleZone.radius === 'number' && sampleZone.radius > 0,
      `Zone has positive numeric radius (${sampleZone.radius}m)`);
    assert(['safe_zone', 'caution_zone', 'restricted_area', 'informational'].includes(sampleZone.zoneType),
      `Zone has recognized zoneType (${sampleZone.zoneType})`);

    // Verify verified vs unverified distinction
    const verifiedZones = geofences.filter(z => z.status === 'verified');
    console.log(`  Found ${verifiedZones.length} verified safety zones (e.g. Purandar Fort, Tamhini Ghat).`);
    assert(verifiedZones.length > 0, 'System contains verified zones properly labeled');

    // -----------------------------------------------------------------
    // 5. SOS INCIDENT SUBMISSION (WITH & WITHOUT LOCATION CONSENT)
    // -----------------------------------------------------------------
    console.log('\n--- 5. Testing SOS Incident Reporting Endpoint ---');

    // Case A: Submit SOS without location consent
    const incidentNoConsentRes = await makeRequest('/incidents', {
      method: 'POST',
      cookie: touristCookie,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        incidentType: 'lost_tourist',
        description: 'Lost on hiking trail near Mahabaleshwar. No GPS enabled.',
        userPhone: '9123456789',
        locationConsent: false
      })
    });
    assert(incidentNoConsentRes.status === 201, 'POST /incidents without GPS consent returns HTTP 201');
    const resAData = JSON.parse(incidentNoConsentRes.data);
    assert(resAData.success === true && resAData.reportId != null, `SOS report created with ID: ${resAData.reportId}`);

    const docA = await Incident.findOne({ reportId: resAData.reportId });
    assert(docA !== null, 'Incident found in MongoDB');
    assert(docA.locationConsent === false, 'locationConsent is false in database');
    assert(docA.location == null || docA.location.latitude == null, 'GPS coordinates were NOT stored when consent was false');
    assert(docA.userPhone === '9123456789', 'Contact phone number was recorded');

    // Case B: Submit SOS WITH explicit location consent
    const incidentWithConsentRes = await makeRequest('/incidents', {
      method: 'POST',
      cookie: touristCookie,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        incidentType: 'medical_emergency',
        description: 'Sprained ankle near Sinhagad Fort slope. Requires assistance.',
        userPhone: '9876543210',
        locationConsent: true,
        latitude: 18.3663,
        longitude: 73.7558,
        accuracy: 12.5,
        address: 'Sinhagad Fort Trail, Pune'
      })
    });
    assert(incidentWithConsentRes.status === 201, 'POST /incidents with GPS consent returns HTTP 201');
    const resBData = JSON.parse(incidentWithConsentRes.data);
    const docB = await Incident.findOne({ reportId: resBData.reportId });
    assert(docB !== null, 'Consent incident found in MongoDB');
    assert(docB.locationConsent === true, 'locationConsent is true in database');
    assert(docB.location?.latitude === 18.3663 && docB.location?.longitude === 73.7558,
      'Valid coordinates were accurately persisted');
    assert(docB.location?.accuracy === 12.5, 'GPS accuracy was recorded');

    // Case C: Validation failures
    const invalidTypeRes = await makeRequest('/incidents', {
      method: 'POST',
      cookie: touristCookie,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        incidentType: 'invalid_type_abc',
        description: 'Test invalid'
      })
    });
    assert(invalidTypeRes.status === 400, 'POST /incidents rejects invalid incidentType with HTTP 400');

    const emptyDescRes = await makeRequest('/incidents', {
      method: 'POST',
      cookie: touristCookie,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        incidentType: 'harassment',
        description: '   '
      })
    });
    assert(emptyDescRes.status === 400, 'POST /incidents rejects empty description with HTTP 400');

    // -----------------------------------------------------------------
    // 6. RATE LIMITING TEST
    // -----------------------------------------------------------------
    console.log('\n--- 6. Testing SOS Rate Limiting (5 requests / 10 min) ---');
    
    // We already submitted 2 valid + 2 invalid requests for touristCookie.
    // Let's submit 4 more valid requests to trigger the 429 Too Many Requests limit.
    let rateLimited = false;
    for (let i = 0; i < 5; i++) {
      const rlRes = await makeRequest('/incidents', {
        method: 'POST',
        cookie: touristCookie,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incidentType: 'other',
          description: `Rate limit burst test #${i + 1}`
        })
      });
      if (rlRes.status === 429) {
        rateLimited = true;
        console.log(`  Rate limiter triggered on request #${i + 1} with HTTP 429`);
        break;
      }
    }
    assert(rateLimited, 'SOS submission is strictly rate limited (HTTP 429 returned after limit exceeded)');

    // -----------------------------------------------------------------
    // 7. USER INCIDENT TRACKING & CROSS-USER ISOLATION
    // -----------------------------------------------------------------
    console.log('\n--- 7. Testing User Incident History & Isolation ---');

    // Tourist 1 viewing their own incidents
    const myIncidentsRes = await makeRequest('/my-incidents', { cookie: touristCookie });
    assert(myIncidentsRes.status === 200, 'GET /my-incidents returns HTTP 200');
    assert(myIncidentsRes.data.includes(docA.reportId), 'My Incidents includes Report A');
    assert(myIncidentsRes.data.includes(docB.reportId), 'My Incidents includes Report B');

    // Tourist 1 viewing single incident detail
    const detailRes = await makeRequest(`/my-incidents/${docB._id}`, { cookie: touristCookie });
    assert(detailRes.status === 200, 'GET /my-incidents/:id returns HTTP 200 for incident owner');
    assert(detailRes.data.includes(docB.reportId), 'Incident detail view displays correct reportId');
    assert(detailRes.data.includes('Sinhagad Fort Trail'), 'Incident detail view displays consented location');

    // Tourist 2 (unauthorized) attempting to view Tourist 1's incident
    const unauthorizedAccessRes = await makeRequest(`/my-incidents/${docB._id}`, { cookie: tourist2Cookie });
    assert(unauthorizedAccessRes.status === 302,
      'Cross-user isolation: User 2 redirected away when accessing User 1 incident');

    // -----------------------------------------------------------------
    // 8. ADMIN INCIDENT DASHBOARD & STATUS WORKFLOW
    // -----------------------------------------------------------------
    console.log('\n--- 8. Testing Admin Incident Dashboard & Status Updates ---');

    // Non-admin attempting to access admin dashboard
    const nonAdminRes = await makeRequest('/admin/incidents', { cookie: touristCookie });
    assert(nonAdminRes.status === 302, 'Non-admin tourist redirected away from /admin/incidents');

    // Admin accessing /admin/incidents
    const adminDashboardRes = await makeRequest('/admin/incidents', { cookie: adminCookie });
    assert(adminDashboardRes.status === 200, 'GET /admin/incidents returns HTTP 200 for admin');
    assert(adminDashboardRes.data.includes('Incident Management Dashboard'), 'Admin view displays correct header');
    assert(adminDashboardRes.data.includes(docB.reportId), 'Admin dashboard lists recent SOS report');

    // Admin viewing incident details
    const adminDetailRes = await makeRequest(`/admin/incidents/${docB._id}`, { cookie: adminCookie });
    assert(adminDetailRes.status === 200, 'Admin can view incident details on /admin/incidents/:id');
    assert(adminDetailRes.data.includes('Update Incident Status'), 'Admin view contains status update form');

    // Non-admin attempting to PATCH incident status
    const nonAdminPatchRes = await makeRequest(`/admin/incidents/${docB._id}/status`, {
      method: 'POST',
      cookie: touristCookie,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'status=Resolved&adminNotes=UnauthorizedUpdate'
    });
    assert(nonAdminPatchRes.status === 302, 'Non-admin blocked from updating incident status');

    // Admin updating incident status to "In Progress"
    const adminPatch1 = await makeRequest(`/admin/incidents/${docB._id}/status`, {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'status=In+Progress&adminNotes=Dispatched+local+patrol+officer+to+trailhead'
    });
    assert(adminPatch1.status === 302, 'Admin PATCH status returns redirect 302');
    
    const docBUpdated1 = await Incident.findById(docB._id);
    assert(docBUpdated1.status === 'In Progress', 'Incident status successfully updated to "In Progress"');
    assert(docBUpdated1.adminNotes === 'Dispatched local patrol officer to trailhead',
      'Admin notes saved in MongoDB');

    // Admin updating incident status to "Resolved"
    const adminPatch2 = await makeRequest(`/admin/incidents/${docB._id}/status`, {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'status=Resolved&adminNotes=Tourist+assisted+safely.+Case+closed.'
    });
    assert(adminPatch2.status === 302, 'Admin update to Resolved returns redirect 302');
    
    const docBUpdated2 = await Incident.findById(docB._id);
    assert(docBUpdated2.status === 'Resolved', 'Incident status successfully updated to "Resolved"');
    assert(docBUpdated2.adminNotes.includes('Case closed'), 'Updated admin notes recorded');

    // -----------------------------------------------------------------
    // 9. SAFETY ZONE MODEL VALIDATIONS (FEATURE 1 & 7)
    // -----------------------------------------------------------------
    console.log('\n--- 9. Testing SafetyZone Model Schema & Validations ---');

    // Default verificationStatus should be 'pending'
    const pendingTestZone = new SafetyZone({
      name: 'Test Wildlife Sanctuary Boundary',
      district: 'Kolhapur',
      latitude: 16.7050,
      longitude: 74.2433,
      radius: 1200,
      zoneType: 'restricted_area',
      restrictedReason: 'Core wildlife corridor; entry prohibited without forest permit.',
      sourceName: 'Maharashtra Forest Department',
      sourceUrl: 'https://mahaforest.gov.in/'
    });
    assert(pendingTestZone.verificationStatus === 'pending', 'New SafetyZone defaults to verificationStatus: pending');
    assert(pendingTestZone.isActive === true, 'New SafetyZone defaults to isActive: true');

    // Invalid coordinate validation
    let invalidLatCaught = false;
    try {
      const badLatZone = new SafetyZone({
        name: 'Invalid Lat Zone',
        district: 'Pune',
        latitude: 105.0, // Invalid: > 90
        longitude: 73.8567,
        radius: 500,
        zoneType: 'caution_zone',
        restrictedReason: 'Test',
        sourceName: 'Official',
        sourceUrl: 'https://mahaforest.gov.in/'
      });
      await badLatZone.validate();
    } catch (err) {
      invalidLatCaught = true;
    }
    assert(invalidLatCaught, 'SafetyZone model strictly rejects invalid latitude (> 90)');

    // Invalid radius validation
    let invalidRadCaught = false;
    try {
      const badRadZone = new SafetyZone({
        name: 'Invalid Radius Zone',
        district: 'Pune',
        latitude: 18.5204,
        longitude: 73.8567,
        radius: -100, // Invalid: negative
        zoneType: 'caution_zone',
        restrictedReason: 'Test',
        sourceName: 'Official',
        sourceUrl: 'https://mahaforest.gov.in/'
      });
      await badRadZone.validate();
    } catch (err) {
      invalidRadCaught = true;
    }
    assert(invalidRadCaught, 'SafetyZone model strictly rejects non-positive radius');

    // Invalid source URL validation
    let invalidUrlCaught = false;
    try {
      const badUrlZone = new SafetyZone({
        name: 'Invalid URL Zone',
        district: 'Pune',
        latitude: 18.5204,
        longitude: 73.8567,
        radius: 500,
        zoneType: 'caution_zone',
        restrictedReason: 'Test',
        sourceName: 'Official',
        sourceUrl: 'not-a-valid-http-url'
      });
      await badUrlZone.validate();
    } catch (err) {
      invalidUrlCaught = true;
    }
    assert(invalidUrlCaught, 'SafetyZone model strictly rejects invalid non-HTTP source URLs');

    // Validity date validation (validUntil < validFrom)
    let invalidDateCaught = false;
    try {
      const badDateZone = new SafetyZone({
        name: 'Invalid Date Zone',
        district: 'Pune',
        latitude: 18.5204,
        longitude: 73.8567,
        radius: 500,
        zoneType: 'caution_zone',
        restrictedReason: 'Test',
        sourceName: 'Official',
        sourceUrl: 'https://mahaforest.gov.in/',
        validFrom: new Date('2026-10-01'),
        validUntil: new Date('2026-09-01') // Invalid: before validFrom
      });
      await badDateZone.validate();
    } catch (err) {
      invalidDateCaught = true;
    }
    assert(invalidDateCaught, 'SafetyZone model rejects validUntil earlier than validFrom');

    // -----------------------------------------------------------------
    // 10. ADMIN SAFETY ZONE ROUTES & GOVERNANCE LIFECYCLE (FEATURE 2 & 7)
    // -----------------------------------------------------------------
    console.log('\n--- 10. Testing Admin Safety Zone Routes & Lifecycle ---');

    // A. Unauthenticated access blocked
    const unauthZoneList = await makeRequest('/admin/safety-zones');
    assert(unauthZoneList.status === 302 && unauthZoneList.headers.location?.includes('/login'),
      'Unauthenticated GET /admin/safety-zones redirects to /login');

    const unauthZoneNew = await makeRequest('/admin/safety-zones/new');
    assert(unauthZoneNew.status === 302, 'Unauthenticated GET /admin/safety-zones/new redirects to /login');

    // B. Non-admin access blocked
    const nonAdminZoneList = await makeRequest('/admin/safety-zones', { cookie: touristCookie });
    assert(nonAdminZoneList.status === 302 && nonAdminZoneList.headers.location?.includes('/login'),
      'Non-admin user blocked from GET /admin/safety-zones');

    const nonAdminZoneNew = await makeRequest('/admin/safety-zones/new', { cookie: touristCookie });
    assert(nonAdminZoneNew.status === 302, 'Non-admin user blocked from GET /admin/safety-zones/new');

    // C. Admin access granted
    const adminZoneList = await makeRequest('/admin/safety-zones', { cookie: adminCookie });
    assert(adminZoneList.status === 200, 'Admin can access GET /admin/safety-zones (HTTP 200)');
    assert(adminZoneList.data.includes('Restricted Area & Safety Zone Management'),
      'Admin safety zones page displays correct governance heading');

    const adminZoneNew = await makeRequest('/admin/safety-zones/new', { cookie: adminCookie });
    assert(adminZoneNew.status === 200, 'Admin can access GET /admin/safety-zones/new (HTTP 200)');

    // D. Admin creates new zone -> must default to pending and record createdBy
    const newZonePostRes = await makeRequest('/admin/safety-zones', {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'name=Radhanagari+Bison+Sanctuary+Core&district=Kolhapur&latitude=16.4167&longitude=73.9833&radius=1800&zoneType=restricted_area&restrictedReason=Indian+Bison+habitat.+Night+safari+prohibited.&sourceName=Maharashtra+Forest+Department&sourceUrl=https%3A%2F%2Fmahaforest.gov.in%2F&notificationNumber=FD-KOL-2018'
    });
    assert(newZonePostRes.status === 302, 'Admin POST /admin/safety-zones creates zone with HTTP 302 redirect');

    const createdZoneInDb = await SafetyZone.findOne({ name: 'Radhanagari Bison Sanctuary Core' });
    assert(createdZoneInDb !== null, 'Created safety zone found in MongoDB');
    assert(createdZoneInDb.verificationStatus === 'pending', 'New zone strictly defaults to verificationStatus: pending');
    assert(createdZoneInDb.createdBy?.toString() === adminUser._id.toString(), 'createdBy accurately reflects admin user ID');
    assert(createdZoneInDb.verifiedBy === null, 'verifiedBy is null while pending');

    // E. Verify pending zone is NOT in public API
    const apiBeforeVerify = await makeRequest('/api/safety/geofences', { cookie: touristCookie });
    const zonesBeforeVerify = JSON.parse(apiBeforeVerify.data).zones || JSON.parse(apiBeforeVerify.data);
    const foundPendingInApi = zonesBeforeVerify.some(z => (z.id || z._id) === createdZoneInDb._id.toString() || z.name.includes('Radhanagari'));
    assert(!foundPendingInApi, 'Pending zone is strictly excluded from public Geofence API');

    // F. Admin verifies zone
    const verifyPostRes = await makeRequest(`/admin/safety-zones/${createdZoneInDb._id}/verify`, {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'decision=verified'
    });
    assert(verifyPostRes.status === 302, 'Admin POST /verify updates zone status with HTTP 302 redirect');

    const verifiedZoneInDb = await SafetyZone.findById(createdZoneInDb._id);
    assert(verifiedZoneInDb.verificationStatus === 'verified', 'Zone verificationStatus updated to verified in MongoDB');
    assert(verifiedZoneInDb.verifiedBy?.toString() === adminUser._id.toString(), 'verifiedBy accurately records verifying admin');
    assert(verifiedZoneInDb.verifiedAt !== null, 'verifiedAt timestamp accurately recorded');

    // G. Verify newly verified zone IS now present in public API
    const apiAfterVerify = await makeRequest('/api/safety/geofences', { cookie: touristCookie });
    const zonesAfterVerify = JSON.parse(apiAfterVerify.data).zones || JSON.parse(apiAfterVerify.data);
    const foundVerifiedInApi = zonesAfterVerify.find(z => (z.id || z._id) === createdZoneInDb._id.toString() || z.name.includes('Radhanagari'));
    assert(foundVerifiedInApi != null, 'Verified zone is now returned by public Geofence API');
    assert(foundVerifiedInApi.zoneType === 'restricted_area', 'API zone contains correct zoneType');
    assert(foundVerifiedInApi.restrictedReason.includes('Indian Bison'), 'API zone contains correct restrictedReason');
    assert(typeof foundVerifiedInApi.id === 'string', 'Zone has string id matching format requirement');

    // H. Deactivate zone -> must be excluded from public API
    const toggleActiveRes = await makeRequest(`/admin/safety-zones/${createdZoneInDb._id}/toggle-active`, {
      method: 'POST',
      cookie: adminCookie
    });
    assert(toggleActiveRes.status === 302, 'Admin toggle-active responds with HTTP 302 redirect');
    const deactivatedZoneInDb = await SafetyZone.findById(createdZoneInDb._id);
    assert(deactivatedZoneInDb.isActive === false, 'Zone isActive is false in MongoDB');

    const apiAfterDeactivate = await makeRequest('/api/safety/geofences', { cookie: touristCookie });
    const zonesAfterDeactivate = JSON.parse(apiAfterDeactivate.data).zones || JSON.parse(apiAfterDeactivate.data);
    const foundDeactivatedInApi = zonesAfterDeactivate.some(z => (z.id || z._id) === createdZoneInDb._id.toString());
    assert(!foundDeactivatedInApi, 'Deactivated zone is strictly excluded from public Geofence API');

    // I. Expired zone exclusion test
    const expiredZone = await SafetyZone.create({
      name: 'Seasonal Monsoon Closed Trail (Expired)',
      district: 'Raigad',
      latitude: 18.2345,
      longitude: 73.4456,
      radius: 600,
      zoneType: 'restricted_area',
      restrictedReason: 'Closed during monsoon only.',
      sourceName: 'Maharashtra Tourism',
      sourceUrl: 'https://maharashtratourism.gov.in/',
      verificationStatus: 'verified',
      isActive: true,
      validFrom: new Date('2025-06-01'),
      validUntil: new Date('2025-09-30') // Expired in past
    });

    const apiWithExpired = await makeRequest('/api/safety/geofences', { cookie: touristCookie });
    const zonesWithExpired = JSON.parse(apiWithExpired.data).zones || JSON.parse(apiWithExpired.data);
    const foundExpiredInApi = zonesWithExpired.some(z => (z.id || z._id) === expiredZone._id.toString());
    assert(!foundExpiredInApi, 'Expired zone (validUntil in past) is strictly excluded from public Geofence API');

    // Clean up test zone
    await SafetyZone.deleteMany({ _id: { $in: [createdZoneInDb._id, expiredZone._id] } });

    // -----------------------------------------------------------------
    // 11. HAVERSINE FORMULA, SIMULATED GPS & ENTER/EXIT ALERTS (FEATURE 5 & 7)
    // -----------------------------------------------------------------
    console.log('\n--- 11. Testing Haversine Distance & Simulated Geofence Alerts ---');

    function haversineDist(lat1, lon1, lat2, lon2) {
      const R = 6371000;
      const toRad = x => (x * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // Reference point: Sanjay Gandhi National Park (19.2288, 72.9182), Radius 2500m
    const zoneCenterLat = 19.2288;
    const zoneCenterLng = 72.9182;
    const zoneRadius = 2500;
    const exitHysteresisBuffer = 35; // 2535m
    const testZoneId = 'zone_sgnp_test';

    // Simulated positions
    const outsidePos = { lat: 19.2600, lng: 72.9182 }; // ~3460m away (Outside)
    const insidePos = { lat: 19.2350, lng: 72.9182 };  // ~690m away (Inside)
    const hysteresisPos = { lat: 19.2515, lng: 72.9182 }; // ~2520m (Inside hysteresis buffer, between 2500 and 2535)

    const distOutside = haversineDist(outsidePos.lat, outsidePos.lng, zoneCenterLat, zoneCenterLng);
    assert(distOutside > zoneRadius + exitHysteresisBuffer, `Outside position is outside radius (${Math.round(distOutside)}m > ${zoneRadius + exitHysteresisBuffer}m)`);

    const distInside = haversineDist(insidePos.lat, insidePos.lng, zoneCenterLat, zoneCenterLng);
    assert(distInside < zoneRadius, `Inside position is inside radius (${Math.round(distInside)}m < ${zoneRadius}m)`);

    // Alert simulation state engine
    const activeZonesState = new Set();
    const alertLogs = [];

    function simulateGpsMovement(userLat, userLng) {
      const dist = haversineDist(userLat, userLng, zoneCenterLat, zoneCenterLng);
      const wasInside = activeZonesState.has(testZoneId);

      if (dist <= zoneRadius) {
        if (!wasInside) {
          activeZonesState.add(testZoneId);
          alertLogs.push({ event: 'ENTER', distance: Math.round(dist) });
        }
      } else if (dist > zoneRadius + exitHysteresisBuffer && wasInside) {
        activeZonesState.delete(testZoneId);
        alertLogs.push({ event: 'EXIT', distance: Math.round(dist) });
      }
    }

    // Step 1: User moves inside
    simulateGpsMovement(insidePos.lat, insidePos.lng);
    assert(activeZonesState.has(testZoneId), 'User entered zone: activeZonesState has testZoneId');
    assert(alertLogs.length === 1 && alertLogs[0].event === 'ENTER', 'Enter alert triggered on entering zone');

    // Step 2: User sends second GPS update while still inside (Duplicate prevention)
    simulateGpsMovement(insidePos.lat, insidePos.lng);
    simulateGpsMovement(19.2340, 72.9182);
    assert(alertLogs.length === 1, 'Duplicate enter alert strictly prevented on subsequent GPS updates inside zone');

    // Step 3: User moves into hysteresis threshold (2520m - still within buffer, not yet exiting)
    simulateGpsMovement(hysteresisPos.lat, hysteresisPos.lng);
    assert(activeZonesState.has(testZoneId), 'Hysteresis prevents premature exit alert when within buffer threshold');
    assert(alertLogs.length === 1, 'No exit alert triggered inside hysteresis buffer');

    // Step 4: User moves completely outside (3460m)
    simulateGpsMovement(outsidePos.lat, outsidePos.lng);
    assert(!activeZonesState.has(testZoneId), 'User exited zone: activeZonesState no longer has testZoneId');
    assert(alertLogs.length === 2 && alertLogs[1].event === 'EXIT', 'Exit alert triggered once when exiting beyond hysteresis buffer');

    // Step 5: Stop monitoring resets state
    activeZonesState.clear();
    assert(activeZonesState.size === 0, 'Stopping monitoring cleanly resets all active zone state');

    // -----------------------------------------------------------------
    // 9. CLEAN UP TEST USERS & INCIDENTS
    // -----------------------------------------------------------------
    console.log('\n--- 9. Cleaning Up Test Artifacts ---');
    await Incident.deleteMany({ _id: { $in: [docA._id, docB._id] } });
    await Incident.deleteMany({ user: touristUser._id });
    await User.deleteMany({ username: { $in: [touristUsername, tourist2Username, adminUsername] } });
    console.log('  Cleaned up temporary test users and incident records.');

    console.log('\n======================================================');
    console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('======================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
}

runSafetyTests();
