// The brain: phase state machine driven by the server clock, sim events and passenger taps.
import { PHASE } from '../shared/contracts.js';
import { line } from './audio/lines.js';

const ORDER = [PHASE.INTRO, PHASE.GATE, PHASE.TAKEOFF, PHASE.CRUISE, PHASE.DESCENT_CALL, PHASE.APPROACH, PHASE.LANDED, PHASE.CERTIFICATE];
const MISSED_TAKEOFF_PROGRESS = 0.03;   // passenger arrived after the real takeoff
const APPROACH_AUTO_MS = 60000;

export function createDirector({ bus, sim, config }) {
  let route = config.ROUTES.find(r => r.id === config.DEFAULT_ROUTE);
  let phase = null;
  let clock = null;
  let ready = false;
  let practice = false;          // takeoff flown from cruise via "Practice takeoff"
  let cruising = false;          // sim currently in cruise mode
  let approachTimer = null;
  let rings = { passed: new Set(), total: 0 };
  const said = new Set();        // one-shot ATC lines per flight
  let save = load(route.id) || { routeId: route.id, phase: PHASE.INTRO, stars: 0, badges: [], kid: true, touchdown: null };

  const storeKey = id => `valkyrie:${id}`;
  function load(id) { try { return JSON.parse(localStorage.getItem(storeKey(id))); } catch { return null; } }
  function persist() { try { localStorage.setItem(storeKey(route.id), JSON.stringify({ ...save, routeId: route.id, phase })); } catch { /* private mode */ } }

  function atc(id, once = true) {
    if (once && said.has(id)) return;
    said.add(id);
    const l = line(id, config, route);
    if (l) bus.emit('atc', l);
  }

  function badge(name) {
    if (save.badges.includes(name)) return;
    save.badges.push(name);
    bus.emit('badge', { name });
    persist();
  }

  function setPhase(next, why = '') {
    if (next === phase) return;
    const prev = phase;
    phase = next;
    clearTimeout(approachTimer);
    enter(next, prev);
    persist();
    bus.emit('phase', { phase: next, prev, why, route, practice });
  }

  function enter(p) {
    switch (p) {
      case PHASE.INTRO:
        ready = false; practice = false; cruising = false; said.clear();
        break;
      case PHASE.GATE:
        sim.spawnOnRunway(route.from, route.depRwy);
        sim.setCamera('chase');
        cruising = false;
        break;
      case PHASE.TAKEOFF:
        sim.spawnOnRunway(route.from, route.depRwy);
        sim.setCamera('chase');
        cruising = false;
        atc('gate', !practice);
        break;
      case PHASE.CRUISE:
        startCruise();
        break;
      case PHASE.DESCENT_CALL:
        if (!cruising) startCruise();
        atc('tod');
        approachTimer = setTimeout(() => takeApproach('auto'), APPROACH_AUTO_MS);
        break;
      case PHASE.APPROACH:
        cruising = false;
        rings = { passed: new Set(), total: 0 };
        sim.spawnOnApproach(route.to, route.arrRwy, 8000);
        sim.setCamera('chase');
        said.delete('land');
        atc('land');
        break;
      case PHASE.LANDED:
        atc('welcome');
        setTimeout(() => { if (phase === PHASE.LANDED) setPhase(PHASE.CERTIFICATE); }, 4000);
        break;
      case PHASE.CERTIFICATE:
        sim.setCamera('orbit');
        break;
    }
  }

  function startCruise() {
    const p = clock ? clamp01(clock.progress) : 0.4;
    sim.startCruise(route, p);
    cruising = true;
  }

  // Phase the clock says we "should" be in, used for resume and missed-takeoff logic.
  function phaseFromClock(c) {
    const todMs = c.arrMs - config.TOD_MIN_BEFORE_ARR * 60000;
    if (c.progress < 0) return PHASE.GATE;
    if (c.nowMs >= c.arrMs) return PHASE.CERTIFICATE;
    if (c.nowMs >= todMs) return PHASE.DESCENT_CALL;
    if (c.progress < MISSED_TAKEOFF_PROGRESS) return PHASE.TAKEOFF;
    return PHASE.CRUISE;
  }

  function onClock(c) {
    const first = !clock;
    clock = c;
    if (c.routeId && c.routeId !== route.id) {
      route = config.ROUTES.find(r => r.id === c.routeId) || route;
      save = load(route.id) || { routeId: route.id, phase: PHASE.INTRO, stars: 0, badges: [], kid: save.kid, touchdown: null };
      bus.emit('route', route);
    }
    if (first && save.phase && save.phase !== PHASE.INTRO && phase === PHASE.INTRO) {
      // Resume after reload: skip the intro, rejoin the flight wherever the clock is.
      bus.emit('intro:skip', {});
      const p = save.phase === PHASE.CERTIFICATE ? PHASE.CERTIFICATE : phaseFromClock(c);
      setPhase(p === PHASE.TAKEOFF ? PHASE.GATE : p, 'resume');
    }

    switch (phase) {
      case PHASE.GATE:
        if (c.progress >= MISSED_TAKEOFF_PROGRESS) { setPhase(PHASE.CRUISE, 'missed-takeoff'); bus.emit('practice:offer', {}); }
        else if (c.progress >= 0 && ready) setPhase(PHASE.TAKEOFF);
        break;
      case PHASE.CRUISE: {
        const p = clamp01(c.progress);
        if (cruising) sim.setCruiseProgress(p);
        if (p >= 0.5) { atc('handoff'); badge('Crossed the Arabian Sea'); }
        if (c.nowMs >= c.arrMs - config.TOD_MIN_BEFORE_ARR * 60000) setPhase(PHASE.DESCENT_CALL);
        break;
      }
      case PHASE.DESCENT_CALL:
        if (cruising) sim.setCruiseProgress(clamp01(c.progress));
        break;
    }
  }

  function takeApproach(why) { if (phase === PHASE.DESCENT_CALL) setPhase(PHASE.APPROACH, why); }

  // Passenger / yoke actions
  const actions = {
    introDone() { if (phase === PHASE.INTRO) setPhase(PHASE.GATE); },
    ready() {
      ready = true;
      bus.emit('ready', {});
      if (phase === PHASE.GATE && clock && clock.progress >= 0) setPhase(PHASE.TAKEOFF);
    },
    takeApproach() { takeApproach('tap'); },
    practiceTakeoff() { if (phase === PHASE.CRUISE) { practice = true; setPhase(PHASE.TAKEOFF, 'practice'); } },
    toggleKid(on = !save.kid) { save.kid = on; sim.setKidMode(on); bus.emit('kid', { on }); persist(); },
    retry() {
      if (phase === PHASE.TAKEOFF) sim.spawnOnRunway(route.from, route.depRwy);
      else if (phase === PHASE.APPROACH) { rings = { passed: new Set(), total: 0 }; sim.spawnOnApproach(route.to, route.arrRwy, 8000); }
    },
    flyAgain() {
      save = { routeId: route.id, phase: PHASE.INTRO, stars: 0, badges: [], kid: save.kid, touchdown: null };
      phase = null; setPhase(PHASE.INTRO);
    },
    jump(p) {
      if (!ORDER.includes(p)) return;
      if (p === PHASE.INTRO) return actions.flyAgain();
      if (p === PHASE.TAKEOFF) ready = true;
      if (p === PHASE.CERTIFICATE && !save.touchdown) save.touchdown = { grade: 'BUTTER', stars: 3, vsMs: -1.2, crossM: 2, alongM: 400 };
      if (p === PHASE.LANDED && !save.touchdown) save.touchdown = { grade: 'BUTTER', stars: 3, vsMs: -1.2, crossM: 2, alongM: 400 };
      practice = false;
      phase = null;          // force re-entry even if already there
      setPhase(p, 'jump');
    },
  };

  bus.on('clock', onClock);
  bus.on('jump', ({ phase: p }) => actions.jump(p));
  bus.on('button', ({ id }) => {
    if (id === 'kid') actions.toggleKid();
    else if (id === 'ready') {
      if (phase === PHASE.INTRO) { bus.emit('intro:skip', {}); actions.introDone(); }
      if (phase === PHASE.GATE) actions.ready();
      else if (phase === PHASE.DESCENT_CALL) actions.takeApproach();
    } else if (id === 'reset') actions.retry();
  });

  bus.on('flight:state', s => {
    if (phase === PHASE.TAKEOFF && s.throttle > 0.5) atc('takeoff', !practice || !said.has('takeoff'));
  });
  bus.on('flight:liftoff', () => { if (phase === PHASE.TAKEOFF) badge('Wheels up'); });
  bus.on('flight:altitude', ({ aglM }) => {
    if (phase !== PHASE.TAKEOFF) return;
    if (aglM >= 300) { practice = false; setPhase(PHASE.CRUISE); atc('departure'); }
  });
  bus.on('flight:ring', ({ index, total }) => {
    rings.passed.add(index); rings.total = total;
    if (total && rings.passed.size >= total) badge('Ring master');
  });
  bus.on('flight:deviation', ({ kind }) => {
    if (phase !== PHASE.APPROACH) return;
    const id = { HIGH: 'high', LOW: 'low', FAST: 'fast', SLOW: 'slow', OFF_CENTRE: 'centre' }[kind];
    if (id) atc(id, false);
  });
  bus.on('flight:touchdown', td => {
    if (phase !== PHASE.APPROACH) return;
    if (td.grade === 'GO_AROUND') { atc('goaround', false); return; }   // sim respawns itself after 3 s
    save.touchdown = td;
    save.stars = Math.max(save.stars || 0, td.stars);
    if (td.grade === 'BUTTER') badge('Butter landing');
    setPhase(PHASE.LANDED);
  });

  return {
    start() {
      sim.setKidMode(save.kid);
      bus.emit('kid', { on: save.kid });
      setPhase(PHASE.INTRO);
    },
    get phase() { return phase; },
    get route() { return route; },
    get clock() { return clock; },
    get save() { return save; },
    actions,
  };
}

const clamp01 = v => Math.max(0, Math.min(1, v));
