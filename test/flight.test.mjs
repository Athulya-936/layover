// Physics sanity tests (no browser needed): `npm test`. Owner: Person A.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, alongCross, grade } from '../web/seat/sim/flight.js';
import { assist, GLIDE } from '../web/seat/sim/assist.js';

const DT = 1 / 120;
const D = Math.PI / 180;

function fly(s, ctx, inputFn, seconds, onEvent = () => {}) {
  for (let t = 0; t < seconds; t += DT) {
    const rc = alongCross(s.x, s.y, ctx.rwyHdg);
    const { input, opts } = assist(s, inputFn(s, t), { ...ctx, ...rc });
    const ev = step(s, input, DT, opts);
    if (ev) { const r = alongCross(s.x, s.y, ctx.rwyHdg); if (onEvent({ ...ev, ...r }) === false) return; }
  }
}

test('kid mode takeoff: full power lifts off and climbs past 300 m', () => {
  const hdg = 281 * D;
  const s = createState({ heading: hdg });
  let liftoffAt = null;
  fly(s, { kid: true, phase: 'takeoff', rwyHdg: hdg }, () => ({ pitch: 0, roll: 0, throttle: 1 }), 90,
    ev => { if (ev.type === 'liftoff' && liftoffAt === null) liftoffAt = ev.alongM; });
  assert.ok(liftoffAt !== null, 'should lift off');
  assert.ok(liftoffAt < 3000, `lift-off inside a ~2.9 km runway, got ${liftoffAt.toFixed(0)} m`);
  assert.ok(s.z > 300, `should climb above 300 m, got ${s.z.toFixed(0)}`);
});

test('pilot mode: nose stays down below rotate speed', () => {
  const s = createState();
  fly(s, { kid: false, phase: 'takeoff', rwyHdg: 0 }, () => ({ pitch: 1, roll: 0, throttle: 0.3 }), 5);
  assert.equal(s.onGround, true);
  assert.equal(s.pitch, 0);
});

test('kid mode approach with hands off lands softly on the runway', () => {
  const hdg = 301 * D, dist = 8000;
  const s = createState({ x: -dist * Math.sin(hdg), y: -dist * Math.cos(hdg), z: dist * Math.tan(GLIDE),
    heading: hdg, speed: 75, pitch: -GLIDE, throttle: 0.11, onGround: false });
  let td = null;
  fly(s, { kid: true, phase: 'approach', rwyHdg: hdg }, () => ({ pitch: 0, roll: 0, throttle: 0 }), 200,
    ev => { if (ev.type === 'touchdown') { td = { ...ev, ...grade(ev.vsMs, ev.alongM, ev.crossM) }; return false; } });
  assert.ok(td, 'should touch down');
  console.log('kid touchdown', td);
  assert.notEqual(td.grade, 'GO_AROUND');
});

test('kid mode approach starting 150 m off centreline still lands', () => {
  const hdg = 301 * D, dist = 8000;
  const off = 150;
  const s = createState({ x: -dist * Math.sin(hdg) + off * Math.cos(hdg), y: -dist * Math.cos(hdg) - off * Math.sin(hdg),
    z: dist * Math.tan(GLIDE) + 60, heading: hdg, speed: 80, pitch: -GLIDE, onGround: false });
  let td = null;
  fly(s, { kid: true, phase: 'approach', rwyHdg: hdg }, () => ({ pitch: 0, roll: 0.3, throttle: 0.5 }), 200,
    ev => { if (ev.type === 'touchdown') { td = { ...ev, ...grade(ev.vsMs, ev.alongM, ev.crossM) }; return false; } });
  assert.ok(td, 'should touch down');
  console.log('offset touchdown', td);
  assert.notEqual(td.grade, 'GO_AROUND');
});

test('grades', () => {
  assert.equal(grade(-1, 300, 0).grade, 'BUTTER');
  assert.equal(grade(-2, 300, 0).grade, 'FIRM');
  assert.equal(grade(-4, 300, 0).grade, 'HARD');
  assert.equal(grade(-6, 300, 0).grade, 'GO_AROUND');
  assert.equal(grade(-1, -50, 0).grade, 'GO_AROUND');
  assert.equal(grade(-1, 300, 40).grade, 'GO_AROUND');
});
