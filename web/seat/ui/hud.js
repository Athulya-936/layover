// HUD: speed / alt / VS / heading / throttle / phase / kid badge / ATC subtitles.
import { UNITS } from '../../shared/contracts.js';

const LABEL = { TAKEOFF: 'TAKEOFF', CRUISE: 'CRUISE · AUTOPILOT', DESCENT_CALL: 'TOP OF DESCENT', APPROACH: 'APPROACH', LANDED: 'LANDED' };
const SHOW = new Set(Object.keys(LABEL));

export function initHud(bus) {
  const el = document.createElement('div');
  el.className = 'hud'; el.hidden = true;
  el.innerHTML = `
    <div class="hud-phase"><span class="ph"></span><span class="kid-badge">KID MODE</span><span class="rings"></span></div>
    <div class="hud-tapes">
      <div class="tape"><div class="v" data-k="spd">0</div><div class="u">KT</div></div>
      <div class="tape"><div class="v" data-k="alt">0</div><div class="u">FT</div></div>
      <div class="tape"><div class="v" data-k="vs">0</div><div class="u">FPM</div></div>
      <div class="tape"><div class="v" data-k="hdg">000</div><div class="u">HDG</div></div>
      <div class="tape thr"><div class="bar"><i></i></div><div class="u">THR</div></div>
    </div>
    <div class="hud-btns">
      <button class="hb-control" hidden title="T">🕹️ Take the controls</button>
      <button class="hb-camera" title="V">🎥 Cockpit view</button>
    </div>`;
  document.body.appendChild(el);
  const sub = document.createElement('div');
  sub.className = 'subtitle'; sub.hidden = true;
  document.body.appendChild(sub);

  const q = k => el.querySelector(`[data-k="${k}"]`);
  const spd = q('spd'), alt = q('alt'), vs = q('vs'), hdg = q('hdg'), thr = el.querySelector('.bar i');
  let latest = null, subTimer = null;

  const ctlBtn = el.querySelector('.hb-control'), camBtn = el.querySelector('.hb-camera');
  ctlBtn.onclick = () => bus.emit('button', { id: 'control', src: 'screen' });
  camBtn.onclick = () => bus.emit('button', { id: 'camera', src: 'screen' });
  bus.on('control', ({ on }) => {
    ctlBtn.textContent = on ? '🤖 Back to autopilot' : '🕹️ Take the controls';
    ctlBtn.classList.toggle('on', on);
    el.querySelector('.ph').textContent = on ? 'CRUISE · YOU HAVE CONTROL' : LABEL[curPhase] || '';
  });
  bus.on('camera', ({ kind }) => { camBtn.textContent = kind === 'cockpit' ? '🎥 Chase view' : '🎥 Cockpit view'; });

  let curPhase = null;
  bus.on('phase', ({ phase }) => {
    curPhase = phase;
    ctlBtn.hidden = phase !== 'CRUISE' && phase !== 'DESCENT_CALL';
    el.hidden = !SHOW.has(phase);
    el.querySelector('.ph').textContent = LABEL[phase] || '';
    el.querySelector('.rings').textContent = '';
  });
  bus.on('kid', ({ on }) => el.classList.toggle('kid', on));
  bus.on('flight:ring', ({ index, total }) => { el.querySelector('.rings').textContent = `◯ ${index + 1}/${total}`; });
  bus.on('flight:state', s => { latest = s; });
  bus.on('atc', ({ text }) => {
    sub.textContent = '📻 ' + text; sub.hidden = false;
    clearTimeout(subTimer); subTimer = setTimeout(() => { sub.hidden = true; }, 6500);
  });

  // Render at ~10 Hz so DOM writes never fight Cesium for frames.
  setInterval(() => {
    if (!latest || el.hidden) return;
    const s = latest;
    spd.textContent = Math.round(s.speedMs * UNITS.KT);
    alt.textContent = Math.round((s.mode === 'cruise' ? s.altM : s.aglM) * UNITS.FT).toLocaleString();
    const fpm = Math.round(s.vsMs * UNITS.FPM / 10) * 10;
    vs.textContent = (fpm > 0 ? '+' : '') + fpm;
    vs.classList.toggle('warn', s.vsMs < -5 && s.aglM < 100);
    hdg.textContent = String(Math.round(((s.headingDeg % 360) + 360) % 360)).padStart(3, '0');
    thr.style.height = `${Math.round(s.throttle * 100)}%`;
  }, 100);
}
