// Phone yoke: device tilt → {pitch, roll}, throttle slider, buttons → seat via ws at 30 Hz.
import { MSG } from '../shared/contracts.js';

const $ = id => document.getElementById(id);
const ROLL_FULL_DEG = 35, PITCH_FULL_DEG = 30, DEADZONE = 0.05;

let ws = null, connected = false;
let raw = { beta: 0, gamma: 0 }, neutral = null, gotSensor = false;
let throttle = 0, brake = false, kid = true;
let invertPitch = false;
try { invertPitch = localStorage.getItem('valkyrie:invertPitch') === '1'; } catch { /* ignore */ }

function send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function connect() {
  ws = new WebSocket(`wss://${location.host}/ws?role=yoke`);
  ws.onopen = () => { connected = true; render(); };
  ws.onclose = () => { connected = false; render(); setTimeout(connect, 1000); };
  ws.onerror = () => ws.close();
  ws.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === MSG.HAPTIC) buzz(m.ms || 200);
  };
}

function buzz(ms) {
  try { navigator.vibrate && navigator.vibrate(ms); } catch { /* iOS has no vibrate */ }
  const f = $('flash'); f.style.transition = 'none'; f.style.opacity = .6;
  requestAnimationFrame(() => { f.style.transition = 'opacity .5s'; f.style.opacity = 0; });
}

// Landscape: roll from beta, pitch from gamma. Signs flip with which way the phone is turned.
function orientationSign() {
  const a = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 90;
  return (a === -90 || a === 270) ? -1 : 1;
}

function shape(x) {
  x = Math.max(-1, Math.min(1, x));
  if (Math.abs(x) < DEADZONE) return 0;
  x = Math.sign(x) * (Math.abs(x) - DEADZONE) / (1 - DEADZONE);
  return x * x * x * 0.5 + x * 0.5;   // expo
}

function axes() {
  if (!gotSensor) return { pitch: 0, roll: 0 };
  const n = neutral || { beta: 0, gamma: 0 };
  const s = orientationSign();
  // Unwrap gamma's ±90 flip so holding the phone fairly upright doesn't jump.
  let dg = raw.gamma - n.gamma; if (dg > 90) dg -= 180; if (dg < -90) dg += 180;
  const roll = shape(s * (raw.beta - n.beta) / ROLL_FULL_DEG);
  let pitch = shape(s * -dg / PITCH_FULL_DEG);
  if (invertPitch) pitch = -pitch;
  return { pitch, roll };
}

function render() {
  const { pitch, roll } = axes();
  $('sky').style.transform = `translateY(${pitch * 30}%) rotate(${-roll * 35}deg)`;
  $('thrFill').style.height = `${throttle * 100}%`;
  $('thrLbl').textContent = `${Math.round(throttle * 100)}%`;
  $('kid').classList.toggle('on', kid);
  $('kid').textContent = kid ? 'KID ✓' : 'KID';
  $('brake').classList.toggle('on', brake);
  $('status').innerHTML = (connected ? '<b>● connected</b>' : '○ connecting…') +
    (gotSensor ? '' : ' · no tilt sensor yet') + ` · pitch ${invertPitch ? 'inverted' : 'normal'} (double-tap horizon)`;
}

function onOrient(e) {
  if (e.beta == null) return;
  raw = { beta: e.beta, gamma: e.gamma };
  if (!gotSensor) { gotSensor = true; neutral = { ...raw }; }
}

// Throttle: drag anywhere on the bar.
function bindThrottle() {
  const el = $('thr');
  const set = e => {
    const r = el.getBoundingClientRect();
    throttle = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    if (throttle < 0.03) throttle = 0;
  };
  el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); set(e); });
  el.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') set(e); });
}

function bindButtons() {
  const b = $('brake');
  b.addEventListener('pointerdown', () => { brake = true; });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => { brake = false; });
  $('ready').addEventListener('click', () => { send({ t: MSG.BUTTON, id: 'ready' }); buzz(40); });
  $('reset').addEventListener('click', () => { send({ t: MSG.BUTTON, id: 'reset' }); buzz(40); });
  $('kid').addEventListener('click', () => { kid = !kid; send({ t: MSG.BUTTON, id: 'kid' }); buzz(40); });
  $('centre').addEventListener('click', () => { neutral = { ...raw }; buzz(40); });
  let lastTap = 0;
  $('horizon').addEventListener('pointerdown', () => {
    const now = Date.now();
    if (now - lastTap < 350) { invertPitch = !invertPitch; try { localStorage.setItem('valkyrie:invertPitch', invertPitch ? '1' : '0'); } catch { /* ignore */ } }
    lastTap = now;
  });
}

async function start() {
  $('err').textContent = '';
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') { $('err').textContent = 'Motion permission denied. Settings → Safari → Motion & Orientation Access.'; return; }
    }
  } catch (e) { $('err').textContent = 'Motion permission error: ' + e.message; return; }
  addEventListener('deviceorientation', onOrient);
  try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch { /* iOS */ }
  try { await screen.orientation?.lock?.('landscape'); } catch { /* not supported */ }
  $('start').style.display = 'none';
  setTimeout(() => { if (!gotSensor) $('status').textContent = 'No tilt data. Use https:// and allow motion access.'; }, 2000);
}

$('go').addEventListener('click', start);
bindThrottle();
bindButtons();
connect();
setInterval(() => {
  const { pitch, roll } = axes();
  send({ t: MSG.INPUT, pitch: +pitch.toFixed(3), roll: +roll.toFixed(3), throttle: +throttle.toFixed(3), brake });
}, 1000 / 30);
setInterval(render, 1000 / 20);
render();
