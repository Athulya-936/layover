// "What's below me": during cruise, a card names the landmark (data/landmarks.json) or nearest city
// (data/airports.json) under or beside the aircraft, with the side it's on. Works on any route.
const R = Math.PI / 180;
const CHECK_MS = 2000;
const CITY_EVERY_MS = 60000;      // with no landmark nearby, name the nearest city this often
const CARD_MS = 12000;
const SHOW_IN = new Set(['CRUISE', 'DESCENT_CALL']);

function km(a, b) {
  const h = Math.sin((b.lat - a.lat) * R / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin((b.lon - a.lon) * R / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const y = Math.sin((b.lon - a.lon) * R) * Math.cos(b.lat * R);
  const x = Math.cos(a.lat * R) * Math.sin(b.lat * R) - Math.sin(a.lat * R) * Math.cos(b.lat * R) * Math.cos((b.lon - a.lon) * R);
  return (Math.atan2(y, x) / R + 360) % 360;
}
/** 'below' within a few km, else 'on your left/right' from the aircraft heading. */
function side(state, p, distKm) {
  if (distKm < 15) return 'Right below you';
  const rel = ((bearing(state, p) - state.headingDeg + 540) % 360) - 180;
  if (Math.abs(rel) < 25) return 'Straight ahead';
  if (Math.abs(rel) > 155) return 'Behind you';
  return rel > 0 ? 'On your right' : 'On your left';
}

export async function createBelow({ bus, airports }) {
  let landmarks = [];
  try { landmarks = await fetch('../data/landmarks.json').then(r => r.json()); } catch { /* cities only */ }
  // Cities worth naming: airports tagged large/medium, deduped by city.
  const seen = new Set();
  const cities = Object.values(airports).filter(a => a.size !== 'small' && a.city && !seen.has(a.city) && seen.add(a.city));
  let regionName = code => code;
  try { const dn = new Intl.DisplayNames(undefined, { type: 'region' }); regionName = code => dn.of(code) || code; } catch { /* old browser */ }

  const el = document.createElement('div');
  el.className = 'below'; el.hidden = true;
  el.innerHTML = '<div class="below-emoji"></div><div><div class="below-side"></div><div class="below-name"></div><div class="below-fact"></div></div>';
  document.body.appendChild(el);

  let phase = null, latest = null, shown = new Set(), lastCard = 0, hideTimer = null, lastCity = null;

  function card({ emoji, sideText, name, fact }) {
    el.querySelector('.below-emoji').textContent = emoji;
    el.querySelector('.below-side').textContent = sideText;
    el.querySelector('.below-name').textContent = name;
    el.querySelector('.below-fact').textContent = fact || '';
    el.hidden = false;
    el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    lastCard = performance.now();
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { el.hidden = true; }, CARD_MS);
  }

  function check() {
    if (!latest || latest.mode !== 'cruise' || !SHOW_IN.has(phase)) return;
    const here = { lat: latest.lat, lon: latest.lon, headingDeg: latest.headingDeg };
    for (const l of landmarks) {
      if (shown.has(l.name)) continue;
      const d = km(here, l);
      if (d > l.radiusKm) continue;
      shown.add(l.name);
      card({ emoji: l.emoji || '📍', sideText: side(here, l, d), name: l.name, fact: l.fact });
      bus.emit('landmark', { name: l.name, badge: l.badge || null });
      return;
    }
    if (performance.now() - lastCard < CITY_EVERY_MS) return;
    let best = null;
    for (const c of cities) {
      const d = km(here, c);
      if (!best || d < best.d) best = { c, d };
    }
    if (!best || best.c.city === lastCity) return;
    lastCity = best.c.city;
    const over = best.d < 30;
    card({
      emoji: over ? '🏙️' : '🧭',
      sideText: over ? 'Right below you' : side(here, best.c, best.d),
      name: `${best.c.city}, ${regionName(best.c.country)}`,
      fact: over ? '' : `${Math.round(best.d).toLocaleString()} km away · nearest city`,
    });
  }

  bus.on('flight:state', s => { latest = s; });
  bus.on('phase', ({ phase: p }) => {
    phase = p;
    if (p === 'INTRO' || p === 'GATE') { shown = new Set(); lastCity = null; }
    if (!SHOW_IN.has(p)) { el.hidden = true; clearTimeout(hideTimer); }
    if (p === 'CRUISE') lastCard = performance.now() - CITY_EVERY_MS + 8000;   // first city card ~8 s in
  });
  setInterval(check, CHECK_MS);
}
