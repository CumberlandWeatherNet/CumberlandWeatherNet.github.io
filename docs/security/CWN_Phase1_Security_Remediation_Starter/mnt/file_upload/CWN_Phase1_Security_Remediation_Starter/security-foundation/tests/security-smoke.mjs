import assert from 'node:assert/strict';

const base = process.env.CWN_TEST_BASE || 'http://localhost:8787';

async function request(path, options = {}) {
  return fetch(base + path, { redirect: 'manual', ...options });
}

const unauthAdmin = await request('/admin/', { headers: { Accept: 'text/html' } });
assert.equal(unauthAdmin.status, 302, 'Unauthenticated admin HTML request must redirect');
assert.equal(unauthAdmin.headers.get('location'), '/login.html');

const unauthSession = await request('/api/auth/session');
assert.equal(unauthSession.status, 401, 'Unauthenticated session request must be rejected');

const unauthWorld = await request('/api/world-between-worlds/status');
assert.equal(unauthWorld.status, 401, 'World Between Worlds must reject unauthenticated requests');

const invalidLogin = await request('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'invalid', password: 'invalid' })
});
assert.equal(invalidLogin.status, 401, 'Invalid credentials must be rejected');

console.log('CWN security smoke tests passed: unauthenticated and invalid access are denied.');
