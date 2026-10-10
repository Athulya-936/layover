// The ONLY public entry point of the sim (BUILD_SPEC §5.4). Owner: Person A.
// Emits on the bus: world:ready, flight:state (20 Hz), flight:liftoff, flight:altitude,
// flight:touchdown, flight:ring, flight:deviation. Nothing else crosses the A/B line.
import { createWorld } from './world.js';
import { makeOrigin, localToWorld, toLatLonH, groundHeights, findRunway } from './frame.js';
import { createState, step, alongCross, grade } from './flight.js';
import { assist, GLIDE, autothrottle } from './assist.js';
import { createRings } from './rings.js';
import { createCruise, CRUISE_ALT } from './cruise.js';
import { createCamera } from './camera.js';

const D = Math.PI / 180;
const PHYS_DT = 1 / 120;
// Cesium models face +x (east) at heading 0, so rotate by -90° to make heading = compass heading.
// If your plane model points sideways in the sandbox, change this (try 0 or 180).
const MODEL_HEADING_OFFSET = -90 * D;
const MODEL_Z_OFFSET = 1.5;          // lift the model so the wheels sit on the runway
const CRUISE_SPEED = 240;            // m/s shown on the HUD during autopilot cruise (~470 kt)
const RING_HIT = { kid: 40, pilot: 30 };
const MANUAL_THROTTLE_DELTA = 0.15;  // Pilot Mode approach: autothrottle until the lever moves this much

export async function createSim({ bus, containerId, config, airports }) {
  const Cesium = window.Cesium;
  const viewer = await createWorld(containerId, config);
  const cam = createCamera(viewer);
  const rings = createRings(viewer);
  const cruise = createCruise(viewer);

  let mode = 'idle';                 // 'idle' | 'free' | 'cruise'
  let phase = 'takeoff';             // assist context: 'takeoff' | 'approach' | 'cruise'
  let s = createState();
  let origin = null, rwy = null, rwyHdg = 0, slope = 0, groundZ = 0;
  let input = { pitch: 0, roll: 0, throttle: 0, brake: false, src: 'keys' };
  let kid = false, paused = false, controlling = false;
  let flags = {}, lastDev = 0, lastSpawn = null, landed = false, spawnSeq = 0;
  let thrRef = null, manualThr = false;
  let blendT = 0, blendFrom = null;  // easing back to the route after takeControl(false)
  let acc = 0, lastFrame = performance.now(), lastEmit = 0;

  const worldPos = Cesium.Cartesian3.fromDegrees(0, 0, 0);
  let orient = Cesium.Quaternion.clone(Cesium.Quaternion.IDENTITY);
  let view = { hdgDeg: 0, pitch: 0, roll: 0, speed: 0, vs: 0, agl: 0 };

  const plane = viewer.entities.add({
    show: false,
    position: new Cesium.CallbackProperty(() => worldPos, false),
    orientation: new Cesium.CallbackProperty(() => orient, false),
    model: { uri: new URL('./assets/plane.glb', import.meta.url).href, minimumPixelSize: 48, scale: 1.0 },
  });

  // Runway ground rises/falls linearly between the two sampled thresholds (DXB 30L drops ~15 m).
  const groundAt = alongM => (rwy ? slope * Math.max(0, Math.min(rwy.lengthM, alongM)) : 0);

  // ---------- physics (fixed step) ----------
  function physics(dt) {
    const rc = alongCross(s.x, s.y, rwyHdg);
    const { input: inp, opts } = assist(s, input, { kid, phase, rwyHdg, ...rc });
    if (!kid && phase === 'approach' && !s.onGround && !manualThr) {
      if (thrRef === null) thrRef = input.throttle;
      if (Math.abs(input.throttle - thrRef) > MANUAL_THROTTLE_DELTA) manualThr = true;
      else inp.throttle = autothrottle(s);
    }
    const gz = controlling ? groundZ : groundAt(rc.alongM);
    const ev = step(s, inp, dt, { ...opts, groundZ: gz });
    const r = alongCross(s.x, s.y, rwyHdg);

    if (ev?.type === 'liftoff') bus.emit('flight:liftoff', {});
    if (ev?.type === 'touchdown' && phase === 'approach' && !landed) {
      const g = grade(ev.vsMs, r.alongM, r.crossM, rwy?.lengthM);
      bus.emit('flight:touchdown', { vsMs: ev.vsMs, crossM: r.crossM, alongM: r.alongM, ...g });
      landed = true;
      if (g.grade === 'GO_AROUND') {
        const seq = spawnSeq;
        setTimeout(() => { if (seq === spawnSeq && lastSpawn) api.spawnOnApproach(lastSpawn.iata, lastSpawn.rwyId, lastSpawn.distM); }, 3000);
      }
    }
    if (phase === 'takeoff' && !s.onGround) {
      for (const a of [300, 1000]) if (s.z - gz >= a && !flags[a]) { flags[a] = true; bus.emit('flight:altitude', { aglM: a }); }
    }
    if (phase === 'approach' && !s.onGround) {
      const hit = rings.update(r.alongM, r.crossM, s.z, kid ? RING_HIT.kid : RING_HIT.pilot);
      if (hit) bus.emit('flight:ring', hit);
      const now = performance.now();
      if (s.z > 15 && r.alongM < -600 && now - lastDev > 8000) {
        const want = Math.max(0, -r.alongM) * Math.tan(GLIDE);
        const kind = s.z - want > 40 ? 'HIGH' : s.z - want < -30 ? 'LOW' : s.speed > 90 ? 'FAST'
          : s.speed < 62 ? 'SLOW' : Math.abs(r.crossM) > 40 ? 'OFF_CENTRE' : null;
        if (kind) { lastDev = now; bus.emit('flight:deviation', { kind }); }
      }
    }
    view = { hdgDeg: s.heading / D, pitch: s.pitch, roll: s.roll, speed: s.speed, vs: s.vs, agl: s.z - gz, rwy: r };
  }

  // ---------- per-frame ----------
  viewer.scene.preUpdate.addEventListener(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (mode === 'idle') return;

    if (!paused && (mode === 'free' || (mode === 'cruise' && controlling))) {
      acc += dt;
      while (acc >= PHYS_DT) { physics(PHYS_DT); acc -= PHYS_DT; }
      localToWorld(origin, s.x, s.y, s.z + MODEL_Z_OFFSET, worldPos);
    }
    if (mode === 'cruise') {
      const p = cruise.update(paused ? 0 : dt);
      const routePos = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.h);
      if (!controlling) {
        if (blendT > 0 && blendFrom) {           // ease back onto the route over 10 s
          blendT = Math.max(0, blendT - dt);
          Cesium.Cartesian3.lerp(routePos, blendFrom, blendT / 10, worldPos);
        } else Cesium.Cartesian3.clone(routePos, worldPos);
        view = { hdgDeg: p.headingDeg, pitch: 0, roll: 0, speed: CRUISE_SPEED, vs: 0, agl: CRUISE_ALT };
      }
    }

    const hpr = new Cesium.HeadingPitchRoll(view.hdgDeg * D + MODEL_HEADING_OFFSET, view.pitch, view.roll);
    orient = Cesium.Transforms.headingPitchRollQuaternion(worldPos, hpr);
    plane.show = cam.kind !== 'cockpit';
    cam.update(worldPos, view.hdgDeg, view.pitch, view.roll, dt, mode === 'cruise' && !controlling);

    if (now - lastEmit > 50) { lastEmit = now; bus.emit('flight:state', api.getState()); }
  });

  // Threshold + far-end ground heights, sampled once per runway and cached.
  const heights = new Map();
  async function prepareRunway(iata, rwyId) {
    const r = findRunway(airports, iata, rwyId);
    const key = `${iata}/${r.end.id}`;
    if (!heights.has(key)) {
      const far = r.far || r.end;
      heights.set(key, groundHeights(viewer, [[r.end.lat, r.end.lon], [far.lat, far.lon]]));
    }
    const [h0, h1] = await heights.get(key);
    return { ...r, h0, h1 };
  }

  function useRunway(r) {
    rwy = r;
    origin = makeOrigin(r.end.lat, r.end.lon, r.h0);
    rwyHdg = r.hdgDeg * D;
    slope = r.lengthM > 0 ? (r.h1 - r.h0) / r.lengthM : 0;
    groundZ = 0;
  }

  // ---------- public API ----------
  const api = {
    async spawnOnRunway(iata, rwyId) {
      const seq = ++spawnSeq;
      const r = await prepareRunway(iata, rwyId);
      if (seq !== spawnSeq) return;              // a newer spawn won
      useRunway(r);
      s = createState({ heading: rwyHdg });
      phase = 'takeoff'; mode = 'free'; controlling = false; flags = {}; landed = false; acc = 0;
      rings.clear(); cruise.showLine(false);
      if (cam.kind === 'orbit') cam.set('chase');
      localToWorld(origin, 0, 0, MODEL_Z_OFFSET, worldPos);
      plane.show = true;
    },

    startCruise(route, progress = 0.4) {
      spawnSeq++;
      const from = findRunway(airports, route.from, route.depRwy).airport;
      const to = findRunway(airports, route.to, route.arrRwy).airport;
      cruise.setRoute(from, to);
      cruise.setProgress(progress, true);
      cruise.showLine(true);
      rings.clear();
      mode = 'cruise'; phase = 'cruise'; controlling = false; blendT = 0;
      if (cam.kind === 'orbit') cam.set('chase');
      plane.show = true;
      cam.flyOverview(cruise.overviewRect());
    },

    setCruiseProgress(progress) { cruise.setProgress(progress); },

    takeControl(on) {
      if (mode !== 'cruise') return;
      if (on && !controlling) {
        const p = toLatLonH(worldPos);
        origin = makeOrigin(p.lat, p.lon, p.h);
        groundZ = -CRUISE_ALT + 500;              // the ground is far below
        s = createState({ heading: view.hdgDeg * D, speed: 150, throttle: 0.6, onGround: false });
        rwyHdg = s.heading; rwy = null;
        controlling = true;
      } else if (!on && controlling) {
        blendFrom = Cesium.Cartesian3.clone(worldPos);
        blendT = 10;
        controlling = false;
      }
    },

    async spawnOnApproach(iata, rwyId, distM = 8000) {
      const seq = ++spawnSeq;
      const r = await prepareRunway(iata, rwyId);
      if (seq !== spawnSeq) return;
      useRunway(r);
      s = createState({
        x: -distM * Math.sin(rwyHdg), y: -distM * Math.cos(rwyHdg), z: distM * Math.tan(GLIDE),
        heading: rwyHdg, speed: 75, pitch: -GLIDE, throttle: 0.11, onGround: false,
      });
      phase = 'approach'; mode = 'free'; controlling = false; landed = false; acc = 0; lastDev = performance.now();
      thrRef = null; manualThr = false;
      lastSpawn = { iata, rwyId, distM };
      cruise.showLine(false);
      rings.build(origin, rwyHdg); rings.show(true);
      if (cam.kind === 'orbit') cam.set('chase');
      plane.show = true;
    },

    setKidMode(on) { kid = !!on; },
    setInput(i) { input = { ...input, ...i }; },
    setCamera(kind) { cam.set(kind); },
    pause(on) { paused = !!on; },
    /** Optional (not in §5.4): Google Photorealistic 3D Tiles. Resolves to whether it is now on. */
    setPhotoreal(on) { return viewer.setPhotoreal(on); },

    /** @returns {import('../../shared/contracts.js').FlightState} */
    getState() {
      const p = toLatLonH(worldPos);
      return {
        lat: p.lat, lon: p.lon, altM: p.h, aglM: view.agl,
        speedMs: view.speed, vsMs: view.vs, headingDeg: view.hdgDeg,
        pitchDeg: view.pitch / D, rollDeg: view.roll / D,
        throttle: mode === 'free' || controlling ? s.throttle : 0.8,
        onGround: mode === 'free' ? s.onGround : false,
        mode: mode === 'cruise' && !controlling ? 'cruise' : 'free',
        rwy: mode === 'free' && view.rwy ? { alongM: view.rwy.alongM, crossM: view.rwy.crossM } : undefined,
      };
    },

    viewer, // escape hatch for A's debugging only, B must not use it
  };

  // Opening shot: above the default departure airport while the intro plays, then announce ready.
  const home = config.ROUTES.find(r => r.id === config.DEFAULT_ROUTE) || config.ROUTES[0];
  try {
    const { end } = findRunway(airports, home.from, home.depRwy);
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(end.lon, end.lat - 0.06, 2500),
      orientation: { heading: 0, pitch: -25 * D, roll: 0 },
    });
    prepareRunway(home.from, home.depRwy);    // warm the height cache
  } catch (e) { console.warn('[sim]', e.message); }
  viewer.whenTilesLoaded(10000).then(() => bus.emit('world:ready', {}));

  return api;
}
