export const PHASE = Object.freeze({
  INTRO: 'INTRO', GATE: 'GATE', TAKEOFF: 'TAKEOFF', CRUISE: 'CRUISE',
  DESCENT_CALL: 'DESCENT_CALL', APPROACH: 'APPROACH', LANDED: 'LANDED', CERTIFICATE: 'CERTIFICATE',
});

/** Control input, all normalised. Produced by yoke/keyboard/touch, consumed by sim.
 * @typedef {{pitch:number, roll:number, throttle:number, brake?:boolean, src:'yoke'|'keys'|'touch'}} Input
 *   pitch -1..1 (+ = nose up), roll -1..1 (+ = right wing down), throttle 0..1 */

/** Snapshot the sim emits ~20×/s. SI units inside; UI converts.
 * @typedef {{
 *   lat:number, lon:number, altM:number, aglM:number,
 *   speedMs:number, vsMs:number, headingDeg:number, pitchDeg:number, rollDeg:number,
 *   throttle:number, onGround:boolean, mode:'free'|'cruise',
 *   rwy?: {alongM:number, crossM:number}   // relative to active runway threshold
 * }} FlightState */

/** Touchdown result.
 * @typedef {{vsMs:number, crossM:number, alongM:number, grade:'BUTTER'|'FIRM'|'HARD'|'GO_AROUND', stars:0|1|2|3}} Touchdown */

/** Clock from the server's mock aircraft feed.
 * @typedef {{depMs:number, arrMs:number, nowMs:number, warp:number, progress:number, routeId:string}} Clock
 *   progress = (now - dep)/(arr - dep), may be <0 (at gate) or >1 */

// WebSocket envelope: JSON {t:<type>, ...payload}. Connect with wss://<host>/ws?role=seat|yoke|admin
export const MSG = Object.freeze({
  INPUT: 'input',   // yoke  → seat   {pitch, roll, throttle, brake}            ~30 Hz, latest wins
  BUTTON: 'button', // yoke  → seat   {id:'kid'|'ready'|'reset'}
  CLOCK: 'clock',   // server→ all    Clock                                       1 Hz + on change
  JUMP: 'jump',     // server→ seat   {phase}                                     from admin
  ADMIN: 'admin',   // admin → server {cmd:'warp', value} | {cmd:'jump', phase} | {cmd:'route', routeId} | {cmd:'reset'}
  HAPTIC: 'haptic', // seat  → yoke   {ms}                                        touchdown buzz
  STATUS: 'status', // seat  → admin  {phase, state:FlightState}                  2 Hz
  // v2 additions (additive only; v1 messages unchanged)
  FEATURE: 'feature',     // server→ seat  {photoreal:boolean}                    admin {cmd:'feature', photoreal}
  TOWER: 'tower',         // tower → seat  {kind:'line', id} | {kind:'text', text} | {kind:'voice', mime, b64}
  READBACK: 'readback',   // seat  → tower {id, heard, ok}                         passenger's spoken read-back
  CLIPS: 'clips',         // server→ seat  {clips:{id:file}}                       after a clip is recorded on /tower
  ROUTE_RESULT: 'routeResult', // server→ sender {route} | {error}                 admin/seat {cmd:'customRoute', from, to}
});
// BUTTON ids (v2): 'kid' | 'ready' | 'reset' | 'control' (take the controls in cruise) | 'camera' (cockpit/chase)
// Clock (v2) also carries `route`: the full route object, so custom routes work without a config change.

export const UNITS = { KT: 1.94384, FT: 3.28084, FPM: 196.85 };
