// Build a flyable route between any two airports in airports.json (the "fly from anywhere" picker).
// Featured routes from config win; otherwise runways are picked from the data, not hardcoded.
const R = Math.PI / 180;
const CRUISE_KMH = 800;          // block time estimate
const TAXI_CLIMB_MIN = 30;       // added to the cruise time
const MIN_BLOCK_MIN = 60;        // the TOD call fires 30 min before arrival, so keep room for cruise
const MIN_RUNWAY_M = 1500;       // ignore short strips when a longer runway exists

function bearingDeg(a, b) {
  const y = Math.sin((b.lon - a.lon) * R) * Math.cos(b.lat * R);
  const x = Math.cos(a.lat * R) * Math.sin(b.lat * R) - Math.sin(a.lat * R) * Math.cos(b.lat * R) * Math.cos((b.lon - a.lon) * R);
  return (Math.atan2(y, x) / R + 360) % 360;
}

function distKm(a, b) {
  const h = Math.sin((b.lat - a.lat) * R / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin((b.lon - a.lon) * R / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const angleDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

/** Runway end whose heading is closest to `wantHdg`, preferring long runways. */
function pickRunwayEnd(airport, wantHdg) {
  const runways = (airport.runways || []).filter(r => r.ends && r.ends.length);
  if (!runways.length) return null;
  const longest = Math.max(...runways.map(r => r.lengthFt || 0)) * 0.3048;
  const usable = runways.filter(r => (r.lengthFt || 0) * 0.3048 >= Math.min(MIN_RUNWAY_M, longest * 0.8));
  let best = null;
  for (const r of usable) {
    for (const e of r.ends) {
      if (!Number.isFinite(e.lat) || !Number.isFinite(e.lon)) continue;
      const score = angleDiff(e.hdg ?? 0, wantHdg) - (r.lengthFt || 0) * 0.3048 / 1000;   // 1 km of runway ≈ 1°
      if (!best || score < best.score) best = { id: e.id, score };
    }
  }
  return best && best.id;
}

function flightNo(from, to) {
  let h = 0;
  for (const c of from + to) h = (h * 31 + c.charCodeAt(0)) % 900;
  return `VK${100 + h}`;
}

/**
 * @param {Array} airports   airports.json array
 * @param {Array} featured   CONFIG.ROUTES
 * @returns {{id, flightNo, from, to, depRwy, arrRwy, blockMin, custom:true} | {error:string}}
 */
function buildRoute(airports, featured, fromIata, toIata) {
  const from = String(fromIata || '').toUpperCase(), to = String(toIata || '').toUpperCase();
  const hit = featured.find(r => r.from === from && r.to === to);
  if (hit) return hit;
  if (from === to) return { error: 'Pick two different airports' };
  const A = airports.find(a => a.iata === from), B = airports.find(a => a.iata === to);
  if (!A || !B) return { error: `Unknown airport ${!A ? from : to}` };
  // Take off roughly toward the destination; land on the runway best aligned with the final course
  // (the great-circle bearing on arrival = reverse bearing from B, flipped).
  const depRwy = pickRunwayEnd(A, bearingDeg(A, B));
  const arrRwy = pickRunwayEnd(B, (bearingDeg(B, A) + 180) % 360);
  if (!depRwy || !arrRwy) return { error: `No runway data for ${!depRwy ? from : to}` };
  const km = distKm(A, B);
  return {
    id: `${from}-${to}`, flightNo: flightNo(from, to), from, to, depRwy, arrRwy,
    blockMin: Math.max(MIN_BLOCK_MIN, Math.round(km / CRUISE_KMH * 60 + TAXI_CLIMB_MIN)),
    custom: true,
  };
}

module.exports = { buildRoute, pickRunwayEnd, bearingDeg, distKm };
