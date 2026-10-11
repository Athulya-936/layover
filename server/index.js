// Valkyrie server: HTTPS static + WebSocket relay + mock aircraft clock. One process, port 8443.
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const selfsigned = require('selfsigned');
const { WebSocketServer } = require('ws');
const { createClock } = require('./clock');
const { buildRoute } = require('./routes');

const PORT = Number(process.env.PORT) || 8443;
// Cloud hosts (Render, Railway, Fly) terminate HTTPS themselves and hand us plain HTTP, so we must
// not use our self-signed cert there. Locally nothing changes: HTTPS on :8443 as before.
const CLOUD = !!(process.env.CLOUD || process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.FLY_APP_NAME);
const ROOT = path.join(__dirname, '..');
const CERT_DIR = path.join(ROOT, 'certs');

// Addresses other devices on the hotspot can reach. IPv4 first; IPv6 too, because Jio-style
// IPv6-only hotspots give the laptop no real IPv4 (macOS shows a 192.0.0.x CLAT address nobody can reach).
const isClat = ip => /^192\.0\.0\.\d+$/.test(ip);
function lanIps() {
  const v4 = [], v6 = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.internal) continue;
      if (ni.family === 'IPv4' && !isClat(ni.address)) v4.push(ni.address);
      else if (ni.family === 'IPv6' && /^[23]/.test(ni.address)) v6.push(ni.address);   // global unicast only
    }
  }
  return [...v4, ...v6];
}
const hostOf = ip => (ip.includes(':') ? `[${ip}]` : ip);

function loadCert() {
  const keyPath = path.join(CERT_DIR, 'key.pem');
  const certPath = path.join(CERT_DIR, 'cert.pem');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const cert = fs.readFileSync(certPath);
    // Reuse the cert only if it still names every current LAN IP (the hotspot IP changes between networks).
    let names = '';
    try { names = new crypto.X509Certificate(cert).subjectAltName || ''; } catch { /* unreadable → regenerate */ }
    // IPv6 addresses rotate (privacy addresses), so only a new IPv4 forces a new cert; the cert is
    // self-signed either way, and the yoke falls back to HTTPS POSTs when wss:// is refused.
    const missing = lanIps().filter(ip => !ip.includes(':') && !names.includes(`IP Address:${ip}`));
    if (names && !missing.length) return { key: fs.readFileSync(keyPath), cert };
    console.log(`[cert] new network address ${missing.join(', ')}: making a fresh certificate (accept the warning again on each device)`);
  }
  const altNames = [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }, ...lanIps().map(ip => ({ type: 7, ip }))];
  const pems = selfsigned.generate([{ name: 'commonName', value: 'valkyrie.local' }], {
    days: 365, keySize: 2048, algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames }],
  });
  fs.mkdirSync(CERT_DIR, { recursive: true });
  fs.writeFileSync(keyPath, pems.private);
  fs.writeFileSync(certPath, pems.cert);
  return { key: pems.private, cert: pems.cert };
}

// Routes live in the frozen ES-module config; pull them out without a bundler.
function loadConfig() {
  const src = fs.readFileSync(path.join(ROOT, 'web/shared/config.js'), 'utf8')
    .replace(/export\s+const\s+CONFIG\s*=/, 'return');
  return new Function(src)();
}

const CONFIG = loadConfig();
const AIRPORTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/data/airports.json'), 'utf8'));
const CLIP_DIR = path.join(ROOT, 'web/seat/audio/clips');
const CLIP_EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' };

// Line ids that may have a recorded clip: the keys of LINES in web/seat/audio/lines.js.
function lineIds() {
  const src = fs.readFileSync(path.join(ROOT, 'web/seat/audio/lines.js'), 'utf8');
  const block = src.slice(src.indexOf('export const LINES'), src.indexOf('};', src.indexOf('export const LINES')));
  return new Set([...block.matchAll(/^\s*([a-z]+):/gm)].map(m => m[1]));
}
function listClips() {
  const out = {};
  for (const f of fs.existsSync(CLIP_DIR) ? fs.readdirSync(CLIP_DIR) : []) {
    const m = f.match(/^([a-z]+)\.(\w+)$/);
    if (m) out[m[1]] = f;
  }
  return out;
}

const app = express();
// Log each page a device opens (with its address), so "did the phone even reach the laptop?" is obvious.
app.use((req, _res, next) => {
  if (req.method === 'GET' && /\/(seat|yoke|admin|tower)\/?$/.test(req.path)) {
    const from = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    console.log(`[http] ${from} opened ${req.path}`);
  }
  next();
});
app.get('/', (_req, res) => res.redirect('/seat/'));
app.get('/api/info', (_req, res) => res.json({ ips: CLOUD ? [] : lanIps(), port: PORT, cloud: CLOUD }));

// Recorded tower clips (recorded in the browser on /tower/, played by the seat through the radio chain).
app.get('/api/clips', (_req, res) => res.json({ ids: [...lineIds()], clips: listClips() }));
app.post('/api/clips/:id', express.raw({ type: 'audio/*', limit: '5mb' }), (req, res) => {
  const id = req.params.id;
  const type = String(req.headers['content-type'] || '').split(';')[0].trim();
  const ext = CLIP_EXT[type];
  if (!lineIds().has(id)) return res.status(400).json({ error: `unknown line id ${id}` });
  if (!ext) return res.status(415).json({ error: `unsupported audio type ${type}` });
  if (!req.body || !req.body.length) return res.status(400).json({ error: 'empty recording' });
  fs.mkdirSync(CLIP_DIR, { recursive: true });
  for (const f of fs.readdirSync(CLIP_DIR)) if (f.startsWith(id + '.')) fs.unlinkSync(path.join(CLIP_DIR, f));
  fs.writeFileSync(path.join(CLIP_DIR, `${id}.${ext}`), req.body);
  console.log(`[clips] saved ${id}.${ext} (${req.body.length} bytes)`);
  sendRole('seat', { t: 'clips', clips: listClips() });
  res.json({ ok: true, clips: listClips() });
});
app.delete('/api/clips/:id', (req, res) => {
  const id = req.params.id;
  if (!lineIds().has(id)) return res.status(400).json({ error: `unknown line id ${id}` });
  for (const f of fs.existsSync(CLIP_DIR) ? fs.readdirSync(CLIP_DIR) : []) if (f.startsWith(id + '.')) fs.unlinkSync(path.join(CLIP_DIR, f));
  sendRole('seat', { t: 'clips', clips: listClips() });
  res.json({ ok: true, clips: listClips() });
});
app.post('/api/yoke', express.json({ limit: '4kb' }), (req, res) => {
  const m = req.body || {};
  if (m.t === 'input' || m.t === 'button') {
    const wasActive = httpYokeActive();
    httpYoke.last = Date.now();
    if (!wasActive) { console.log('[http] +yoke (fallback transport)'); sendRole('seat', { t: 'yoke', connected: true }); presence(); }
    sendRole('seat', m);
  }
  res.json({ haptic: httpYoke.haptic });
  httpYoke.haptic = 0;
});
// no-cache = always revalidate (cheap 304s on the LAN). Stops phones running a stale yoke.js after an update.
app.use(express.static(path.join(ROOT, 'web'), { extensions: ['html'], setHeaders: res => res.setHeader('Cache-Control', 'no-cache') }));

const server = CLOUD ? http.createServer(app) : https.createServer(loadCert(), app);
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = { seat: new Set(), yoke: new Set(), admin: new Set(), tower: new Set() };
const features = { photoreal: false };   // seat-side toggles from admin, replayed to new seats

function send(ws, msg) { if (ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); }
function sendRole(role, msg) { const s = JSON.stringify(msg); for (const ws of clients[role]) send(ws, s); }
function broadcast(msg) { for (const r of Object.keys(clients)) sendRole(r, msg); }
// iPhone Safari often refuses wss:// to a self-signed cert even after the page warning was accepted,
// so the yoke can fall back to plain HTTPS POSTs (same origin, same accepted cert). Tracked here.
const httpYoke = { last: 0, haptic: 0 };
const httpYokeActive = () => Date.now() - httpYoke.last < 3000;
const yokeCount = () => clients.yoke.size + (httpYokeActive() ? 1 : 0);
setInterval(() => {
  if (httpYoke.last && !httpYokeActive()) { httpYoke.last = 0; sendRole('seat', { t: 'yoke', connected: yokeCount() > 0 }); presence(); }
}, 1000);

function presence() {
  const p = { t: 'presence', seat: clients.seat.size, yoke: yokeCount(), admin: clients.admin.size, tower: clients.tower.size };
  sendRole('admin', p); sendRole('tower', p);
}

const clock = createClock({
  routes: CONFIG.ROUTES,
  defaultRoute: CONFIG.DEFAULT_ROUTE,
  todMin: CONFIG.TOD_MIN_BEFORE_ARR,
  onChange: c => broadcast({ t: 'clock', ...c }),
});

function handleAdmin(m, ws) {
  switch (m.cmd) {
    case 'warp': clock.setWarp(m.value); break;
    case 'jump': if (clock.jump(m.phase)) sendRole('seat', { t: 'jump', phase: m.phase }); break;
    case 'route': if (clock.setRoute(m.routeId)) sendRole('seat', { t: 'jump', phase: 'INTRO' }); break;
    case 'customRoute': {
      const r = buildRoute(AIRPORTS, CONFIG.ROUTES, m.from, m.to);
      send(ws, { t: 'routeResult', ...(r.error ? { error: r.error } : { route: r }) });
      if (!r.error && clock.setRoute(r)) sendRole('seat', { t: 'jump', phase: 'INTRO' });
      break;
    }
    case 'feature':
      if (typeof m.photoreal === 'boolean') features.photoreal = m.photoreal;
      sendRole('seat', { t: 'feature', ...features });
      break;
    case 'reset': clock.reset(); sendRole('seat', { t: 'jump', phase: 'INTRO' }); break;
  }
}

wss.on('connection', (ws, req) => {
  const role = new URL(req.url, 'https://x').searchParams.get('role');
  if (!clients[role]) { ws.close(1008, 'role must be seat|yoke|admin|tower'); return; }
  // Online, visitors come one at a time: the first seat to arrive gets a fresh flight from the gate.
  if (CLOUD && role === 'seat' && clients.seat.size === 0) clock.reset();
  clients[role].add(ws);
  console.log(`[ws] +${role} (${clients[role].size})`);
  send(ws, { t: 'clock', ...clock.snapshot() });
  if (role === 'seat') {
    sendRole('seat', { t: 'yoke', connected: yokeCount() > 0 });
    send(ws, { t: 'feature', ...features });
  }
  if (role === 'yoke') sendRole('seat', { t: 'yoke', connected: true });
  presence();

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (role === 'yoke' && (m.t === 'input' || m.t === 'button')) sendRole('seat', m);
    else if (role === 'seat' && m.t === 'status') { sendRole('admin', m); sendRole('tower', m); }
    else if (role === 'seat' && m.t === 'haptic') { sendRole('yoke', m); if (httpYokeActive()) httpYoke.haptic = m.ms || 200; }
    else if (role === 'seat' && m.t === 'readback') sendRole('tower', m);
    else if (role === 'seat' && m.t === 'admin' && m.cmd === 'customRoute') handleAdmin(m, ws);   // seat's own picker
    else if (role === 'admin' && m.t === 'admin') handleAdmin(m, ws);
    else if (role === 'tower' && m.t === 'tower') sendRole('seat', m);
  });

  ws.on('close', () => {
    clients[role].delete(ws);
    console.log(`[ws] -${role} (${clients[role].size})`);
    if (role === 'yoke') sendRole('seat', { t: 'yoke', connected: yokeCount() > 0 });
    presence();
  });
});

server.listen(PORT, '::', () => {   // '::' = IPv6 + IPv4 (dual stack)
  console.log(`\n  VALKYRIE up on :${PORT}${CLOUD ? ' (cloud mode: plain HTTP behind the host\'s HTTPS)' : ''}\n`);
  if (CLOUD) return;
  const ips = lanIps();
  if (!ips.length) console.log('  ⚠ No address other devices can reach. Join a phone hotspot (an iPhone hotspot is the most reliable).\n');
  else if (!ips.some(ip => !ip.includes(':'))) console.log('  ℹ This hotspot is IPv6-only: use the [....] links below on the phone.\n');
  for (const ip of ['localhost', ...ips].map(hostOf)) {
    console.log(`  seat   https://${ip}:${PORT}/seat/`);
    console.log(`  yoke   https://${ip}:${PORT}/yoke/`);
    console.log(`  admin  https://${ip}:${PORT}/admin/`);
    console.log(`  tower  https://${ip}:${PORT}/tower/\n`);
  }
});
