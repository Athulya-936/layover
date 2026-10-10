// Valkyrie server: HTTPS static + WebSocket relay + mock aircraft clock. One process, port 8443.
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const express = require('express');
const selfsigned = require('selfsigned');
const { WebSocketServer } = require('ws');
const { createClock } = require('./clock');

const PORT = Number(process.env.PORT) || 8443;
const ROOT = path.join(__dirname, '..');
const CERT_DIR = path.join(ROOT, 'certs');

function lanIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
  }
  return out;
}

function loadCert() {
  const keyPath = path.join(CERT_DIR, 'key.pem');
  const certPath = path.join(CERT_DIR, 'cert.pem');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
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
const app = express();
app.get('/', (_req, res) => res.redirect('/seat/'));
app.get('/api/info', (_req, res) => res.json({ ips: lanIps(), port: PORT }));
app.use(express.static(path.join(ROOT, 'web'), { extensions: ['html'] }));

const server = https.createServer(loadCert(), app);
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = { seat: new Set(), yoke: new Set(), admin: new Set() };

function send(ws, msg) { if (ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); }
function sendRole(role, msg) { const s = JSON.stringify(msg); for (const ws of clients[role]) send(ws, s); }
function broadcast(msg) { for (const r of Object.keys(clients)) sendRole(r, msg); }
function presence() {
  sendRole('admin', { t: 'presence', seat: clients.seat.size, yoke: clients.yoke.size, admin: clients.admin.size });
}

const clock = createClock({
  routes: CONFIG.ROUTES,
  defaultRoute: CONFIG.DEFAULT_ROUTE,
  todMin: CONFIG.TOD_MIN_BEFORE_ARR,
  onChange: c => broadcast({ t: 'clock', ...c }),
});

function handleAdmin(m) {
  switch (m.cmd) {
    case 'warp': clock.setWarp(m.value); break;
    case 'jump': if (clock.jump(m.phase)) sendRole('seat', { t: 'jump', phase: m.phase }); break;
    case 'route': if (clock.setRoute(m.routeId)) sendRole('seat', { t: 'jump', phase: 'INTRO' }); break;
    case 'reset': clock.reset(); sendRole('seat', { t: 'jump', phase: 'INTRO' }); break;
  }
}

wss.on('connection', (ws, req) => {
  const role = new URL(req.url, 'https://x').searchParams.get('role');
  if (!clients[role]) { ws.close(1008, 'role must be seat|yoke|admin'); return; }
  clients[role].add(ws);
  console.log(`[ws] +${role} (${clients[role].size})`);
  send(ws, { t: 'clock', ...clock.snapshot() });
  if (role === 'seat') sendRole('seat', { t: 'yoke', connected: clients.yoke.size > 0 });
  if (role === 'yoke') sendRole('seat', { t: 'yoke', connected: true });
  presence();

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (role === 'yoke' && (m.t === 'input' || m.t === 'button')) sendRole('seat', m);
    else if (role === 'seat' && m.t === 'status') sendRole('admin', m);
    else if (role === 'seat' && m.t === 'haptic') sendRole('yoke', m);
    else if (role === 'admin' && m.t === 'admin') handleAdmin(m);
  });

  ws.on('close', () => {
    clients[role].delete(ws);
    console.log(`[ws] -${role} (${clients[role].size})`);
    if (role === 'yoke') sendRole('seat', { t: 'yoke', connected: clients.yoke.size > 0 });
    presence();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  VALKYRIE up on :${PORT}\n`);
  for (const ip of ['localhost', ...lanIps()]) {
    console.log(`  seat   https://${ip}:${PORT}/seat/`);
    console.log(`  yoke   https://${ip}:${PORT}/yoke/`);
    console.log(`  admin  https://${ip}:${PORT}/admin/\n`);
  }
});
