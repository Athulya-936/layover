// Arcade flight model. Pure math, no Cesium, so it can be unit-tested in Node.
// Frame: origin = active runway threshold (or cruise point), x = east, y = north, z = up (m above origin ground).
// Angles in radians, heading = compass (0 = north, clockwise). Owner: Person A.

export const K = {
  g: 9.81,
  THRUST: 4.5,          // m/s² at full throttle
  DRAG: 0.00018,        // per (m/s)²
  BRAKE: 3.0,           // m/s² on ground
  ROLLING: 0.15,        // rolling friction on ground, m/s²
  V_ROTATE: 70,         // m/s, nose can come up
  V_STALL: 55,          // m/s, below this you sink
  PITCH_RATE: 0.6,      // rad/s at full stick
  ROLL_RATE: 1.0,
  ROLL_LEVEL: 0.5,      // self-levelling rad/s when stick centred
  MAX_PITCH: 20 * Math.PI / 180,
  MAX_ROLL: 35 * Math.PI / 180,
  MIN_PITCH: -15 * Math.PI / 180,
};

export function createState(o = {}) {
  return {
    x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0,
    speed: 0, vs: 0, throttle: 0, onGround: true, airborneTime: 0,
    ...o,
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Advance the state by dt seconds. Mutates s.
 * @param {object} s       state from createState
 * @param {{pitch:number, roll:number, throttle:number, brake?:boolean}} input
 * @param {number} dt
 * @param {{maxPitch?:number, maxRoll?:number, groundZ?:number}} opts
 * @returns {null | {type:'liftoff'} | {type:'touchdown', vsMs:number}}
 */
export function step(s, input, dt, opts = {}) {
  const maxPitch = opts.maxPitch ?? K.MAX_PITCH;
  const maxRoll = opts.maxRoll ?? K.MAX_ROLL;
  let event = null;

  s.throttle = clamp(input.throttle, 0, 1);

  // Speed along the flight path
  let acc = s.throttle * K.THRUST - K.DRAG * s.speed * s.speed - K.g * Math.sin(s.pitch);
  if (s.onGround) acc -= K.ROLLING + (input.brake ? K.BRAKE : 0);
  s.speed = Math.max(0, s.speed + acc * dt);

  // Attitude
  s.pitch += clamp(input.pitch, -1, 1) * K.PITCH_RATE * dt;
  if (Math.abs(input.roll) > 0.03) s.roll += clamp(input.roll, -1, 1) * K.ROLL_RATE * dt;
  else s.roll -= Math.sign(s.roll) * Math.min(Math.abs(s.roll), K.ROLL_LEVEL * dt);

  if (s.onGround) {
    s.roll = 0;
    // Nose can only come up once we're fast enough
    s.pitch = clamp(s.pitch, 0, s.speed >= K.V_ROTATE ? maxPitch : 0);
  } else {
    s.pitch = clamp(s.pitch, Math.max(K.MIN_PITCH, -maxPitch), maxPitch);
    s.roll = clamp(s.roll, -maxRoll, maxRoll);
  }

  // Banking turns the aircraft (coordinated turn)
  if (!s.onGround) s.heading += K.g * Math.tan(s.roll) / Math.max(s.speed, 30) * dt;
  s.heading = (s.heading + 2 * Math.PI) % (2 * Math.PI);

  // Vertical speed: climb along pitch, sink when slow
  let vs = s.speed * Math.sin(s.pitch);
  if (s.speed < K.V_STALL && !s.onGround) vs -= (K.V_STALL - s.speed) * 0.6;
  if (s.onGround && vs < 0) vs = 0;
  s.vs = vs;

  const horiz = s.speed * Math.cos(s.pitch);
  s.x += horiz * Math.sin(s.heading) * dt;
  s.y += horiz * Math.cos(s.heading) * dt;
  s.z += vs * dt;

  const groundZ = opts.groundZ ?? 0;
  if (s.onGround) {
    if (vs > 0.3) { s.onGround = false; s.airborneTime = 0; event = { type: 'liftoff' }; }
    else s.z = groundZ;
  } else {
    s.airborneTime += dt;
    if (s.z <= groundZ) {
      event = { type: 'touchdown', vsMs: vs };
      s.z = groundZ; s.onGround = true; s.vs = 0;
      s.pitch = Math.max(0, Math.min(s.pitch, 0.1));
    }
  }
  return event;
}

/** Along/cross-track relative to a runway threshold. cross > 0 = right of centreline. */
export function alongCross(x, y, headingRad) {
  return {
    alongM: x * Math.sin(headingRad) + y * Math.cos(headingRad),
    crossM: x * Math.cos(headingRad) - y * Math.sin(headingRad),
  };
}

/** Landing grade (BUILD_SPEC §6). Landing short, long (past lengthM) or off the side is a go-around. */
export function grade(vsMs, alongM, crossM, lengthM = Infinity) {
  const v = Math.abs(vsMs);
  if (Math.abs(crossM) > 30 || alongM < 0 || alongM > lengthM || v >= 5) return { grade: 'GO_AROUND', stars: 0 };
  if (v < 1.5) return { grade: 'BUTTER', stars: 3 };
  if (v < 3) return { grade: 'FIRM', stars: 2 };
  return { grade: 'HARD', stars: 1 };
}
