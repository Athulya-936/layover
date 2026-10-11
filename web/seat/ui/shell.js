// IFE shell: flight card + whole-flight timeline bar, home tiles, gate panel, yoke QR.
import { renderQR } from './wherenext.js';

const MIN = 60000;
const fmtDur = ms => { const m = Math.max(0, Math.round(ms / MIN)); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`; };
const fmtTime = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function createShell({ bus, config, airports, actions, openWhereNext }) {
  let route = config.ROUTES.find(r => r.id === config.DEFAULT_ROUTE);
  let clock = null, phase = null, ready = false;

  // Top bar: flight card + timeline.
  const top = document.createElement('div');
  top.className = 'topbar'; top.hidden = true;
  top.innerHTML = `
    <div class="fcard"><span class="fno"></span><span class="froute"></span></div>
    <div class="timeline">
      <div class="track"><div class="done"></div><div class="marker">✈</div></div>
      <div class="ticks"></div>
    </div>
    <div class="tinfo"><div class="remain"></div><div class="eta"></div></div>
    <div class="topbtns"><button class="home-btn" title="Home">☰</button><button class="wn-btn">🌍 Where next?</button></div>`;
  document.body.appendChild(top);
  top.querySelector('.home-btn').onclick = () => showHome(!home.hidden ? false : true);
  top.querySelector('.wn-btn').onclick = openWhereNext;

  // Home screen.
  const home = document.createElement('div');
  home.className = 'overlay home'; home.hidden = true;
  home.innerHTML = `
    <div class="home-inner">
      <div class="home-head"><div class="welcome">Welcome aboard</div><div class="hroute"></div></div>
      <div class="tiles">
        <button class="tile disabled" data-t="movies"><span>🎬</span>Movies<small>demo</small></button>
        <button class="tile disabled" data-t="music"><span>🎧</span>Music<small>demo</small></button>
        <button class="tile" data-t="map"><span>🗺️</span>Live Map</button>
        <button class="tile hero" data-t="fly"><span>✈</span>Fly This Flight<small>You're the pilot</small></button>
        <button class="tile" data-t="wn"><span>🌍</span>Where Next?<small>by The Visa Guy</small></button>
      </div>
      <div class="gate" hidden>
        <div class="gate-text"></div>
        <div class="gate-row">
          <div class="yoke-qr"><div class="qr"></div><small>Scan to use your phone as the yoke</small></div>
          <div class="gate-actions">
            <button class="ready primary">I'm ready to fly</button>
            <div class="countdown"></div>
            <button class="kidtoggle"></button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(home);
  const gate = home.querySelector('.gate');
  home.querySelector('[data-t="fly"]').onclick = () => { gate.hidden = false; home.querySelector('.tiles').hidden = true; };
  home.querySelector('[data-t="map"]').onclick = () => showHome(false);
  home.querySelector('[data-t="wn"]').onclick = openWhereNext;
  home.querySelector('.ready').onclick = () => actions.ready();
  home.querySelector('.kidtoggle').onclick = () => actions.toggleKid();

  // Yoke QR: use the LAN IP even if the seat was opened on localhost.
  fetch('/api/info').then(r => r.json()).then(({ ips, port, cloud }) => {
    if (cloud) {
      // Hosted online: the public address works for everyone. Offer the demo controls to visitors.
      renderQR(home.querySelector('.yoke-qr .qr'), `${location.origin}/yoke/`, 140);
      home.querySelector('.yoke-qr small').textContent = `Scan with your phone, or open ${location.origin}/yoke/`;
      const a = document.createElement('a');
      a.className = 'demo-link'; a.href = '../admin/'; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = '🛠 Demo controls ↗';
      a.title = 'Opens /admin in a new tab: jump to cruise, approach, landing…';
      document.body.appendChild(a);
      return;
    }
    // Keep the address the seat was opened on if phones can reach it; otherwise (localhost, an
    // unreachable 192.0.0.x CLAT address) use the server's first reachable IP. IPv6 needs [brackets].
    const here = location.hostname.replace(/^\[|\]$/g, '');
    const fmt = ip => (ip.includes(':') ? `[${ip}]` : ip);
    const host = ips.includes(here) || !ips[0] ? location.host : `${fmt(ips[0])}:${port}`;
    renderQR(home.querySelector('.yoke-qr .qr'), `https://${host}/yoke/`, 140);
    home.querySelector('.yoke-qr small').textContent = `Scan, or open https://${host}/yoke/`;
  }).catch(() => {});

  function showHome(on) {
    home.hidden = !on;
    if (on) { const atGate = phase === 'GATE'; gate.hidden = !atGate; home.querySelector('.tiles').hidden = atGate; }
  }

  function setRoute(r) {
    route = r;
    const A = airports[r.from], B = airports[r.to];
    top.querySelector('.fno').textContent = r.flightNo;
    top.querySelector('.froute').textContent = `${A?.city || r.from} → ${B?.city || r.to}`;
    home.querySelector('.hroute').textContent = `${r.flightNo} · ${A?.city || r.from} → ${B?.city || r.to}`;
  }
  setRoute(route);

  // Timeline spans gate (dep − 10 min) → landing.
  function pos(c, ms) { const start = c.depMs - 10 * MIN; return Math.max(0, Math.min(1, (ms - start) / (c.arrMs - start))); }
  function drawTicks(c) {
    const ticks = [['Gate', c.depMs - 10 * MIN], ['Takeoff', c.depMs], ['Cruise', c.depMs + 0.15 * (c.arrMs - c.depMs)],
      ['TOD', c.arrMs - config.TOD_MIN_BEFORE_ARR * MIN], ['Land', c.arrMs]];
    // Long flights squeeze Gate against Takeoff: drop a label that would overlap the next one.
    const shown = ticks.filter(([, ms], i) => i === ticks.length - 1 || pos(c, ticks[i + 1][1]) - pos(c, ms) >= 0.06);
    top.querySelector('.ticks').innerHTML = shown.map(([l, ms]) => `<span style="left:${pos(c, ms) * 100}%">${l}</span>`).join('');
  }

  bus.on('clock', c => {
    const changed = !clock || clock.depMs !== c.depMs || clock.arrMs !== c.arrMs;
    clock = c;
    if (changed) drawTicks(c);
    const p = pos(c, c.nowMs) * 100;
    top.querySelector('.done').style.width = `${p}%`;
    top.querySelector('.marker').style.left = `${p}%`;
    top.querySelector('.remain').textContent = c.nowMs < c.depMs ? `Departs in ${fmtDur(c.depMs - c.nowMs)}` : c.nowMs < c.arrMs ? `${fmtDur(c.arrMs - c.nowMs)} to ${airports[route.to]?.city?.split('/')[0] || route.to}` : 'Arrived';
    top.querySelector('.eta').textContent = `ETA ${fmtTime(c.arrMs)}${c.warp !== 1 ? ` · ⏩ ${c.warp}×` : ''}`;
    updateGate();
  });
  bus.on('route', setRoute);
  bus.on('ready', () => { ready = true; updateGate(); });
  bus.on('kid', ({ on }) => { home.querySelector('.kidtoggle').textContent = on ? '🧒 Kid Mode: ON' : '🧑‍✈️ Pilot Mode (Kid Mode off)'; });
  bus.on('phase', ({ phase: p, route: r }) => {
    phase = p;
    if (r) setRoute(r);
    top.hidden = p === 'INTRO';
    if (p === 'INTRO') ready = false;
    showHome(p === 'GATE');
    updateGate();
  });

  function updateGate() {
    if (phase !== 'GATE' || !clock) return;
    const A = airports[route.from];
    const t = clock.depMs - clock.nowMs;
    home.querySelector('.gate-text').innerHTML = `<b>${A?.city || route.from}, runway ${route.depRwy}</b><br>${ready ? 'Ready! Waiting for takeoff clearance…' : 'Grab the yoke and tell us when you\'re ready.'}`;
    home.querySelector('.countdown').textContent = t > 0 ? `Takeoff in ${Math.floor(t / MIN)}:${String(Math.floor(t / 1000) % 60).padStart(2, '0')}` : 'Cleared for takeoff';
    home.querySelector('.ready').disabled = ready;
  }

  return { showHome };
}
