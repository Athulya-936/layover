// Seat wiring: bus + net + input + sim + director + UI + audio.
import { CONFIG } from '../shared/config.js';
import { PHASE } from '../shared/contracts.js';
import { createBus } from '../shared/bus.js';
import { createNet } from './net.js';
import { createInput } from './input.js';
import { createDirector } from './director.js';
import { createShell } from './ui/shell.js';
import { createIntro } from './ui/intro.js';
import { initHud } from './ui/hud.js';
import { initNotify, toast } from './ui/notify.js';
import { createCertificate } from './ui/certificate.js';
import { createWhereNext } from './ui/wherenext.js';
import { initRadio, unlockAudio } from './audio/radio.js';

const bus = createBus();
window.valkyrie = { bus };   // handy in devtools

const list = await fetch('../data/airports.json').then(r => r.json());
const airports = Object.fromEntries(list.map(a => [a.iata, a]));

// Person A's sim if merged, else a stub that fakes enough events to drive the experience.
async function loadSim() {
  try {
    const mod = await import('./sim/sim.js');
    if (typeof mod.createSim === 'function') {
      return await mod.createSim({ bus, containerId: 'cesium', config: CONFIG, airports });
    }
  } catch (e) { console.warn('[seat] real sim unavailable, using stub:', e.message); }
  return createStubSim(bus);
}

const loading = document.getElementById('loading');
bus.on('world:ready', () => loading.classList.add('gone'));
setTimeout(() => loading.classList.add('gone'), 15000);  // never get stuck on the loader

const sim = await loadSim();
initRadio(bus);
initHud(bus);
initNotify(bus);
createInput(bus);
bus.on('input', i => sim.setInput(i));

const director = createDirector({ bus, sim, config: CONFIG });
createNet(bus, { getPhase: () => director.phase });

const whereNext = createWhereNext({ config: CONFIG, getRoute: () => director.route });
createShell({ bus, config: CONFIG, airports, actions: director.actions, openWhereNext: () => whereNext.open() });
const cert = createCertificate({ bus, config: CONFIG, airports, onFlyAgain: () => director.actions.flyAgain(), onWhereNext: () => whereNext.open() });
const intro = createIntro({ airports, onStart: unlockAudio, onDone: () => director.actions.introDone() });

addEventListener('pointerdown', unlockAudio, { once: true });
bus.on('intro:skip', () => intro.skip());

let closeDescent = null;
bus.on('phase', ({ phase, route }) => {
  if (closeDescent) { closeDescent(); closeDescent = null; }
  if (phase === PHASE.INTRO) intro.show(route);
  if (phase === PHASE.CERTIFICATE) cert.show({ route, save: director.save });
  if (phase !== PHASE.CRUISE && phase !== PHASE.CERTIFICATE) whereNext.close();
  if (phase === PHASE.DESCENT_CALL) {
    closeDescent = toast('Dubai Approach is calling! Want to fly the landing?', {
      title: '📻 Incoming call', ttl: 0, kind: 'call',
      actions: [{ label: 'Take the approach', primary: true, fn: () => director.actions.takeApproach() }],
    });
  }
});
bus.on('practice:offer', () => toast('You boarded after takeoff. Want to try one anyway?', {
  title: 'Missed the takeoff?', ttl: 12000,
  actions: [{ label: 'Practice takeoff', primary: true, fn: () => director.actions.practiceTakeoff() }],
}));
bus.on('net:status', ({ connected }) => document.body.classList.toggle('offline', !connected));

director.start();

// ---------------------------------------------------------------------------
// Stub sim: same API as §5.4, no Cesium. Lets B test the whole flow before A merges.
function createStubSim(bus) {
  const log = (...a) => console.log('[stub-sim]', ...a);
  let s = null, input = { pitch: 0, roll: 0, throttle: 0 }, kid = true, mode = 'free', paused = false;
  let fired = {}, approach = false;
  const base = () => ({ lat: 0, lon: 0, altM: 0, aglM: 0, speedMs: 0, vsMs: 0, headingDeg: 0, pitchDeg: 0, rollDeg: 0, throttle: 0, onGround: true, mode: 'free', rwy: { alongM: 0, crossM: 0 } });
  setTimeout(() => bus.emit('world:ready', {}), 300);
  document.getElementById('cesium').classList.add('stub');

  setInterval(() => {
    if (!s || paused) return;
    const dt = 0.05;
    if (mode === 'cruise') { bus.emit('flight:state', s); return; }
    s.throttle = kid && approach ? 0.5 : input.throttle;
    s.speedMs += (s.throttle * 3.2 - 0.00018 * s.speedMs ** 2) * dt;
    if (approach) s.speedMs = 75;
    s.headingDeg += input.roll * 2 * dt * 10;
    s.rollDeg = input.roll * 25; s.pitchDeg = input.pitch * 10;
    if (s.onGround && !approach) {
      if (s.speedMs > 70 && input.pitch > 0.2) { s.onGround = false; bus.emit('flight:liftoff', {}); }
    } else {
      s.vsMs = approach ? (kid && s.aglM < 15 ? -1 : -4 + input.pitch * 3) : 6 + input.pitch * 6;
      s.aglM = Math.max(0, s.aglM + s.vsMs * dt);
      s.rwy.alongM += s.speedMs * dt;
      for (const h of [300, 1000]) if (!approach && s.aglM >= h && !fired[h]) { fired[h] = 1; bus.emit('flight:altitude', { aglM: h }); }
      if (approach && s.rwy.alongM > -8000 * (1 - 1 / 8) && !fired.r) { fired.r = 1; bus.emit('flight:ring', { index: 0, total: 8 }); }
      if (approach && s.aglM <= 0 && !s.onGround) {
        s.onGround = true;
        const v = Math.abs(s.vsMs);
        const grade = v < 1.5 ? 'BUTTER' : v < 3 ? 'FIRM' : v < 5 ? 'HARD' : 'GO_AROUND';
        bus.emit('flight:touchdown', { vsMs: s.vsMs, crossM: 0, alongM: 300, grade, stars: { BUTTER: 3, FIRM: 2, HARD: 1, GO_AROUND: 0 }[grade] });
        if (grade === 'GO_AROUND') setTimeout(() => api.spawnOnApproach(), 3000);
      }
    }
    s.altM = s.aglM;
    bus.emit('flight:state', s);
  }, 50);

  const api = {
    spawnOnRunway(iata, rwy) { log('spawnOnRunway', iata, rwy); s = base(); mode = 'free'; approach = false; fired = {}; },
    startCruise(route, p) { log('startCruise', route.id, p); s = { ...base(), altM: 11000, aglM: 11000, speedMs: 240, onGround: false, mode: 'cruise', throttle: 0.8 }; mode = 'cruise'; },
    setCruiseProgress(p) { if (s) s.progress = p; },
    takeControl(on) { log('takeControl', on); },
    spawnOnApproach(iata, rwy, d = 8000) { log('spawnOnApproach', iata, rwy, d); s = { ...base(), aglM: d * Math.tan(3 * Math.PI / 180), speedMs: 75, onGround: false, rwy: { alongM: -d, crossM: 0 } }; mode = 'free'; approach = true; fired = {}; },
    setKidMode(on) { log('setKidMode', on); kid = on; },
    setInput(i) { input = i; },
    setCamera(k) { log('setCamera', k); },
    pause(on) { paused = on; },
    getState() { return s; },
  };
  return api;
}
