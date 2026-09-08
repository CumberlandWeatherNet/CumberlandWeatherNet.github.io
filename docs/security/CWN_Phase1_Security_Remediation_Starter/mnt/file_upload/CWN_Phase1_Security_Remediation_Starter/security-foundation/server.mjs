import http from 'node:http';
import { readFile, stat, appendFile } from 'node:fs/promises';
import { resolve, extname, join, normalize } from 'node:path';
import { randomBytes, timingSafeEqual, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import process from 'node:process';

const scrypt = promisify(scryptCallback);
const ROOT = resolve(new URL('.', import.meta.url).pathname);
const PUBLIC_ROOT = join(ROOT, 'public');
const PRIVATE_ROOT = join(ROOT, 'private-admin');
const PORT = Number(process.env.CWN_PORT || 8787);
const ENV = process.env.CWN_ENV || 'sandbox';
const TTL_MS = Number(process.env.CWN_SESSION_TTL_MINUTES || 30) * 60_000;
const COOKIE_SECURE = String(process.env.CWN_COOKIE_SECURE || 'false') === 'true';
const AUDIT_FILE = join(ROOT, 'security-audit.jsonl');

const ROLES = new Set(['admin', 'power_admin', 'world_between_worlds']);
const sessions = new Map();

function config() {
  const username = process.env.CWN_ADMIN_USERNAME || '';
  const passwordHash = process.env.CWN_ADMIN_PASSWORD_HASH || '';
  const role = process.env.CWN_ADMIN_ROLE || 'admin';
  const owner = process.env.CWN_WORLD_OWNER_USERNAME || '';
  if (!username || !passwordHash || !ROLES.has(role)) {
    throw new Error('Missing or invalid CWN authentication environment configuration.');
  }
  if (role === 'world_between_worlds' && username !== owner) {
    throw new Error('World Between Worlds is restricted to the configured owner account.');
  }
  return { username, passwordHash, role, owner };
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    ...headers
  });
  res.end(JSON.stringify(body));
}

async function audit(event, req, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    environment: ENV,
    event,
    method: req.method,
    path: req.url?.split('?')[0] || '',
    remoteAddress: req.socket.remoteAddress || '',
    userAgent: req.headers['user-agent'] || '',
    ...details
  };
  await appendFile(AUDIT_FILE, JSON.stringify(entry) + '\n').catch(() => {});
}

function parseCookies(req) {
  const result = {};
  const raw = req.headers.cookie || '';
  for (const pair of raw.split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) result[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1));
  }
  return result;
}

function sessionCookie(id, maxAgeSeconds) {
  const secure = COOKIE_SECURE ? '; Secure' : '';
  return `cwn_session=${encodeURIComponent(id)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

function getSession(req) {
  const id = parseCookies(req).cwn_session;
  if (!id) return null;
  const session = sessions.get(id);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  session.expiresAt = Date.now() + TTL_MS;
  return { id, ...session };
}

function authorize(req, allowedRoles) {
  const session = getSession(req);
  if (!session) return { ok: false, status: 401, code: 'AUTH_REQUIRED' };
  if (!allowedRoles.includes(session.role)) return { ok: false, status: 403, code: 'ACCESS_DENIED' };
  if (session.role === 'world_between_worlds' && session.username !== config().owner) {
    return { ok: false, status: 403, code: 'OWNER_ONLY' };
  }
  return { ok: true, session };
}

async function verifyPassword(password, encoded) {
  const [kind, nText, rText, pText, saltHex, keyHex] = encoded.split('$');
  if (kind !== 'scrypt' || !saltHex || !keyHex) return false;
  const candidate = await scrypt(password, Buffer.from(saltHex, 'hex'), Buffer.from(keyHex, 'hex').length, {
    N: Number(nText), r: Number(rText), p: Number(pText), maxmem: 64 * 1024 * 1024
  });
  const expected = Buffer.from(keyHex, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

async function readBody(req, limit = 32_768) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('REQUEST_TOO_LARGE');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const relative = normalize(decoded).replace(/^([/\\])+/, '');
  const target = resolve(root, relative || 'index.html');
  return target.startsWith(resolve(root) + '/') || target === resolve(root) ? target : null;
}

async function serveFile(req, res, root, requestPath) {
  let target = safeJoin(root, requestPath);
  if (!target) return json(res, 403, { error: 'ACCESS_DENIED' });
  try {
    const info = await stat(target);
    if (info.isDirectory()) target = join(target, 'index.html');
    const data = await readFile(target);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
    res.writeHead(200, {
      'Content-Type': types[extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    });
    res.end(data);
  } catch {
    json(res, 404, { error: 'NOT_FOUND' });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readBody(req);
      const cfg = config();
      const valid = body.username === cfg.username && await verifyPassword(String(body.password || ''), cfg.passwordHash);
      if (!valid) {
        await audit('auth.login.denied', req, { username: String(body.username || '') });
        return json(res, 401, { error: 'INVALID_CREDENTIALS' });
      }
      const id = randomBytes(32).toString('base64url');
      const csrf = randomBytes(24).toString('base64url');
      sessions.set(id, { username: cfg.username, role: cfg.role, csrf, expiresAt: Date.now() + TTL_MS });
      await audit('auth.login.success', req, { username: cfg.username, role: cfg.role });
      return json(res, 200, { authenticated: true, user: { username: cfg.username, role: cfg.role }, csrf }, {
        'Set-Cookie': sessionCookie(id, Math.floor(TTL_MS / 1000))
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      const session = getSession(req);
      const csrf = req.headers['x-cwn-csrf'];
      if (session && csrf !== session.csrf) return json(res, 403, { error: 'CSRF_INVALID' });
      if (session) sessions.delete(session.id);
      await audit('auth.logout', req, { username: session?.username || null });
      return json(res, 200, { authenticated: false }, { 'Set-Cookie': sessionCookie('', 0) });
    }

    if (req.method === 'GET' && url.pathname === '/api/auth/session') {
      const auth = authorize(req, ['admin', 'power_admin', 'world_between_worlds']);
      if (!auth.ok) return json(res, auth.status, { authenticated: false, error: auth.code });
      return json(res, 200, {
        authenticated: true,
        user: { username: auth.session.username, role: auth.session.role },
        expiresAt: new Date(auth.session.expiresAt).toISOString(),
        csrf: auth.session.csrf
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/world-between-worlds/status') {
      const auth = authorize(req, ['world_between_worlds']);
      if (!auth.ok) {
        await audit('protected.denied', req, { code: auth.code });
        return json(res, auth.status, { error: auth.code });
      }
      return json(res, 200, { accessible: true, owner: auth.session.username });
    }

    if (url.pathname.startsWith('/admin')) {
      const auth = authorize(req, ['admin', 'power_admin', 'world_between_worlds']);
      if (!auth.ok) {
        await audit('protected.denied', req, { code: auth.code });
        if (req.headers.accept?.includes('text/html')) {
          res.writeHead(302, { Location: '/login.html', 'Cache-Control': 'no-store' });
          return res.end();
        }
        return json(res, auth.status, { error: auth.code });
      }
      const privatePath = url.pathname.replace(/^\/admin\/?/, '') || 'index.html';
      return serveFile(req, res, PRIVATE_ROOT, privatePath);
    }

    const publicPath = url.pathname === '/' ? '/login.html' : url.pathname;
    return serveFile(req, res, PUBLIC_ROOT, publicPath);
  } catch (error) {
    await audit('server.error', req, { message: error.message });
    return json(res, 500, { error: 'SERVER_ERROR' });
  }
});

server.listen(PORT, () => {
  console.log(`CWN security foundation listening on http://localhost:${PORT} (${ENV})`);
});
