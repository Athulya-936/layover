// ATC line table. {CS} = callsign + flight digits. Each line has display text and a spoken form.
// Place names come from airports.json, so any route works:
//   {DEP}/{ARR} = departure/arrival city, {MID} = the big airport nearest the route's midpoint (handoff centre).
const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const SIDE = { L: 'left', R: 'right', C: 'centre' };

export const LINES = {
  gate:      '{CS}, {DEP} Tower, runway {DEPRWY}, line up and wait.',
  takeoff:   '{CS}, wind calm, runway {DEPRWY}, cleared for takeoff.',
  departure: '{CS}, contact departure. Good flight.',
  handoff:   '{CS}, {MID} Control, radar contact, maintain flight level 360.',
  tod:       '{CS}, {ARR} Approach, descend to 3000 feet, cleared ILS runway {ARRRWY}.',
  land:      '{CS}, runway {ARRRWY}, wind calm, cleared to land.',
  high:      "{CS}, you're high on the glide path.",
  low:       "{CS}, you're low on the glide path, check altitude.",
  fast:      '{CS}, reduce speed.',
  slow:      '{CS}, increase speed.',
  centre:    '{CS}, correct to the centreline.',
  goaround:  '{CS}, go around, go around. Vectors for another approach.',
  welcome:   '{CS}, welcome to {ARR}. Taxi to the gate.',
  readback:  '{CS}, readback correct.',
};

/** What the passenger should say back for clearances that support read-back. */
export const READBACK = {
  takeoff: 'Cleared for takeoff, runway {DEPRWY}, {CS}.',
  land:    'Cleared to land, runway {ARRRWY}, {CS}.',
};

let airports = {};
const midCache = new Map();
/** Give the line table the airport map ({IATA: airport}) so it can name places. */
export function setAirports(map) { airports = map || {}; midCache.clear(); }

const city = iata => (airports[iata]?.city || iata).split('/')[0].trim();
const R = Math.PI / 180;
/** Point a fraction f of the way along the great circle a → b. */
function along(a, b, f) {
  const φ1 = a.lat * R, λ1 = a.lon * R, φ2 = b.lat * R, λ2 = b.lon * R;
  const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
  if (d === 0) return { lat: a.lat, lon: a.lon };
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return { lat: Math.atan2(z, Math.hypot(x, y)) / R, lon: Math.atan2(y, x) / R };
}
/**
 * Handoff centre: the large airport nearest the point 2/3 along the route, outside the departure and
 * arrival countries (the FIR you cross into), e.g. Muscat for Calicut → Dubai.
 */
export function midCity(route) {
  const key = `${route.from}-${route.to}`;
  if (midCache.has(key)) return midCache.get(key);
  const A = airports[route.from], B = airports[route.to];
  let best = null;
  if (A && B) {
    const m = along(A, B, 2 / 3);
    const pick = abroad => {
      for (const ap of Object.values(airports)) {
        if (ap.size !== 'large' || ap.iata === route.from || ap.iata === route.to) continue;
        if (abroad && (ap.country === A.country || ap.country === B.country)) continue;
        // Distance, discounted for hubs (more runways ≈ the city an area control centre is named after)
        const hub = 1 + 0.5 * (Math.min(4, ap.runways?.length || 1) - 1);
        const d = Math.hypot(ap.lat - m.lat, (ap.lon - m.lon) * Math.cos(m.lat * R)) / hub;
        if (!best || d < best.d) best = { d, city: ap.city.split('/')[0].trim() };
      }
    };
    pick(A.country !== B.country);       // domestic flights hand off within the country
    if (!best) pick(false);
  }
  const out = best ? best.city : 'Area';
  midCache.set(key, out);
  return out;
}

const spellDigits = s => String(s).split('').map(c => DIGITS[+c] ?? SIDE[c] ?? c).join(' ');

export function callsign(config, route) {
  const digits = route.flightNo.replace(/\D/g, '');
  return { text: `${config.CALLSIGN} ${digits}`, speech: `${config.CALLSIGN} ${spellDigits(digits)}` };
}

export function fill(tpl, config, route, spoken) {
  const cs = callsign(config, route);
  return tpl
    .replace('{CS}', spoken ? cs.speech : cs.text)
    .replace('{DEP}', city(route.from))
    .replace(/\{ARR\}/g, city(route.to))
    .replace('{MID}', midCity(route))
    .replace(/\{DEPRWY\}/g, spoken ? spellDigits(route.depRwy) : route.depRwy)
    .replace(/\{ARRRWY\}/g, spoken ? spellDigits(route.arrRwy) : route.arrRwy);
}

/** @returns {{id:string, text:string, speech:string}} */
export function line(id, config, route) {
  const tpl = LINES[id];
  if (!tpl) return null;
  return { id, text: fill(tpl, config, route, false), speech: fill(tpl, config, route, true).replace('3000', 'three thousand').replace('360', 'three six zero') };
}
