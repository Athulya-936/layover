// "Fly from anywhere": pick any From/To pair from airports.json. The server builds the route
// (runways chosen from the data) and switches the flight clock for every device.
const MAX_HITS = 7;

/** Rank airports for a query: exact IATA first, then city/name prefix, then substring. */
export function searchAirports(list, q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const hits = [];
  for (const a of list) {
    const iata = a.iata.toLowerCase(), city = (a.city || '').toLowerCase(), name = a.name.toLowerCase();
    let score = iata === q ? 0 : city.startsWith(q) ? 1 : name.startsWith(q) ? 2 : iata.startsWith(q) ? 2.5
      : city.includes(q) ? 3 : name.includes(q) ? 4 : -1;
    if (score < 0) continue;
    score += a.size === 'large' ? 0 : a.size === 'medium' ? 0.3 : 0.6;
    score -= Math.max(0, ...(a.runways || []).map(r => r.lengthFt || 0)) / 1e6;   // tie-break: the big hub (LHR before LGW)
    hits.push({ a, score });
  }
  return hits.sort((x, y) => x.score - y.score).slice(0, MAX_HITS).map(h => h.a);
}

export function createPicker({ bus, airports, send, getRoute }) {
  const list = Object.values(airports);
  const el = document.createElement('div');
  el.className = 'overlay picker'; el.hidden = true;
  el.innerHTML = `
    <div class="panel">
      <button class="close" aria-label="Close">✕</button>
      <h2>Fly from anywhere</h2>
      <p class="lede">Pick any two airports. We'll find the real runways and set up your flight.</p>
      <div class="pk-row">
        <label class="pk-field"><span>From</span><input data-k="from" autocomplete="off" placeholder="City or code, e.g. Kochi"><div class="pk-hits"></div></label>
        <div class="pk-arrow">✈</div>
        <label class="pk-field"><span>To</span><input data-k="to" autocomplete="off" placeholder="e.g. London"><div class="pk-hits"></div></label>
      </div>
      <div class="pk-msg"></div>
      <button class="primary pk-go" disabled>Set up this flight</button>
    </div>`;
  document.body.appendChild(el);
  const chosen = { from: null, to: null };
  const msg = el.querySelector('.pk-msg'), go = el.querySelector('.pk-go');
  const label = a => `${a.city || a.name} (${a.iata})`;

  for (const input of el.querySelectorAll('input')) {
    const k = input.dataset.k, hitsEl = input.parentElement.querySelector('.pk-hits');
    const pick = a => { chosen[k] = a; input.value = label(a); hitsEl.innerHTML = ''; update(); };
    input.addEventListener('input', () => {
      chosen[k] = null; update();
      hitsEl.innerHTML = '';
      for (const a of searchAirports(list, input.value)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = `<b>${a.iata}</b> ${a.city || ''} <small>${a.name}</small>`;
        b.onpointerdown = e => { e.preventDefault(); pick(a); };
        hitsEl.appendChild(b);
      }
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { const first = searchAirports(list, input.value)[0]; if (first) pick(first); } });
    input.addEventListener('blur', () => setTimeout(() => { hitsEl.innerHTML = ''; }, 150));
  }

  function update() {
    const ok = chosen.from && chosen.to && chosen.from.iata !== chosen.to.iata;
    go.disabled = !ok;
    msg.textContent = chosen.from && chosen.to && !ok ? 'Pick two different airports' : '';
  }

  go.onclick = () => {
    go.disabled = true; msg.textContent = 'Finding runways…';
    send({ t: 'admin', cmd: 'customRoute', from: chosen.from.iata, to: chosen.to.iata });
  };
  bus.on('routeResult', r => {
    if (el.hidden) return;
    if (r.error) { msg.textContent = r.error; update(); return; }
    close();
  });
  el.querySelector('.close').onclick = () => close();

  function open() {
    const r = getRoute();
    for (const [k, iata] of [['from', r.from], ['to', r.to]]) {
      chosen[k] = airports[iata] || null;
      el.querySelector(`[data-k="${k}"]`).value = chosen[k] ? label(chosen[k]) : '';
    }
    update(); msg.textContent = '';
    el.hidden = false;
  }
  function close() { el.hidden = true; }
  return { open, close };
}
