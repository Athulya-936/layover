// Kid Mode assists: autothrottle, gentle limits, auto-rotate, glide path + centreline, autoflare, autobrake.
// Pilot Mode gets no assists (but still the normal limits). Owner: Person A.
import { K } from './flight.js';

const D = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export const KID_LIMITS = { maxPitch: 10 * D, maxRoll: 25 * D };
export const GLIDE = 3 * D;

/** Approach autothrottle: holds ~75 m/s on the 3° path. Also used in Pilot Mode until the lever moves. */
export const autothrottle = s => clamp(0.11 + 0.06 * (75 - s.speed), 0, 1);

/**
 * @param s      flight state (flight.js)
 * @param input  raw Input
 * @param ctx    {kid:boolean, phase:'takeoff'|'approach'|'cruise', rwyHdg:number(rad), alongM, crossM}
 * @returns {{input:object, opts:object}}
 */
export function assist(s, input, ctx) {
  if (!ctx.kid) return { input, opts: {} };
  const out = { ...input };
  const user = { pitch: input.pitch * 0.4, roll: input.roll * 0.4 };

  if (ctx.phase === 'takeoff') {
    if (s.onGround) {
      out.throttle = input.throttle > 0.05 ? 1 : 0;        // any push = full power
      out.pitch = s.speed > K.V_ROTATE + 3 ? 0.7 : 0;      // auto-rotate
      out.roll = 0;
    } else {
      out.throttle = clamp(0.7 + 0.08 * (85 - s.speed), 0.3, 1);
      out.pitch = clamp((8 * D - s.pitch) * 3, -1, 1) + user.pitch;   // hold ~8° climb
      out.roll = user.roll * 2;
    }
  } else if (ctx.phase === 'approach') {
    const dist = Math.max(0, -ctx.alongM);                // metres before threshold
    if (s.onGround) {
      out.throttle = 0; out.brake = true; out.pitch = -0.3; out.roll = 0;
    } else if (s.z < 15) {
      // Autoflare: aim for -1 m/s at touchdown
      const target = Math.asin(clamp(-1.0 / Math.max(s.speed, 40), -1, 1));
      out.pitch = clamp((target - s.pitch) * 4, -1, 1);
      out.throttle = s.z < 5 ? 0 : 0.08;
      out.roll = clamp(-s.roll * 3, -1, 1);
    } else {
      // Glide path: pitch toward -3° plus a correction for being high/low
      const err = dist * Math.tan(GLIDE) - s.z;             // + = we're low
      const targetPitch = -GLIDE + clamp(err * 0.004, -0.08, 0.08);
      out.pitch = clamp((targetPitch - s.pitch) * 3, -1, 1) + user.pitch;
      // Autothrottle 75 m/s
      out.throttle = autothrottle(s);
      // Centreline: steer the heading toward the runway, bank to get there
      const wantHdg = ctx.rwyHdg + clamp(-ctx.crossM * 0.003, -0.35, 0.35);
      const wantRoll = clamp(wrap(wantHdg - s.heading) * 2, -0.35, 0.35);
      out.roll = clamp((wantRoll - s.roll) * 2, -1, 1) + user.roll;
    }
  } else if (ctx.phase === 'cruise') {
    out.throttle = clamp(0.6 + 0.05 * (110 - s.speed), 0.2, 1);
  }
  return { input: out, opts: KID_LIMITS };
}
