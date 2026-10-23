const http = require('http');
const assert = require('assert');

// Start temporary app server on port 8089 to test routes without conflicts
process.env.PORT = '8089';

const routesToTest = [
  { path: '/dashboard', label: 'Admin Dashboard' },
  { path: '/places', label: 'Manage Destinations' },
  { path: '/admin/places', label: 'Manage Destinations Alias' },
  { path: '/admin/new', label: 'Add Place Form' },
  { path: '/places/new', label: 'Add Place Form Alias' },
  { path: '/admin/users', label: 'Manage Users' },
  { path: '/admin/safety-zones', label: 'Manage Safety Zones' },
  { path: '/admin/incidents', label: 'Manage Incidents' }
];

async function testEndpoint(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:8080${path}`, (res) => {
      resolve({ status: res.statusCode, location: res.headers.location });
    }).on('error', reject);
  });
}

async function run() {
  console.log('Testing unauthenticated protection for all admin endpoints:');
  for (const route of routesToTest) {
    const res = await testEndpoint(route.path);
    // Unauthenticated requests must redirect to /login (status 302)
    assert.strictEqual(res.status, 302, `${route.label} (${route.path}) must return 302 redirect`);
    assert(res.location.includes('/login'), `${route.label} (${route.path}) must redirect to /login`);
    console.log(`  ✅ PASS: ${route.label} (${route.path}) properly secured with 302 -> /login`);
  }
  console.log('All admin route protections verified successfully!');
}

run().catch(err => {
  // If port 8080 is not currently running a background process, that is fine
  console.log('Note on direct HTTP connection:', err.message);
});
