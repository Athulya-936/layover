// Keyboard + on-screen touch fallback → bus 'input'. The yoke wins whenever it is sending.
// Keys (same as A's sandbox): W/S pitch (S = pull back = nose up), A/D roll, Shift/Ctrl throttle,
// B brake, K kid toggle, V cockpit/chase camera, T take the controls / back to autopilot (cruise).
export function createInput(bus) {
  const keys = new Set();
  let throttle = 0;
  let lastYoke = 0;
  let lastLocal = 0;
  let touch = { pitch: 0, roll: 0, brake: false };
  let panel = null;
  let yokeSeen = false;

  bus.on('input', i => { if (i.src === 'yoke') { lastYoke = performance.now(); yokeSeen = true; throttle = i.throttle; hidePanel(); } });
  bus.on('yoke:presence', p => { if (p.connected) { yokeSeen = true; hidePanel(); } });

  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,select,textarea')) return;
    const k = e.key.toLowerCase();
    if (!e.repeat) {
      const id = { k: 'kid', v: 'camera', t: 'control' }[k];
      if (id) bus.emit('button', { id, src: 'keys' });
    }
    keys.add(e.code);
    lastLocal = performance.now();
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  function tick() {
    const now = performance.now();
    const dt = 1 / 30;
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) throttle = Math.min(1, throttle + 0.6 * dt);
    if (keys.has('ControlLeft') || keys.has('ControlRight')) throttle = Math.max(0, throttle - 0.6 * dt);
    if (keys.size) lastLocal = now;
    if (now - lastYoke < 500) return;          // yoke is live; stay quiet
    if (now - lastLocal > 1500) return;        // nothing local happening
    const kp = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0);
    const kr = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    // Arrow keys mirror W/S/A/D (Up = push = nose down, like a real yoke).
    const ap = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
    const ar = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
    const pitch = clamp(kp + ap + touch.pitch), roll = clamp(kr + ar + touch.roll);
    const brake = keys.has('KeyB') || touch.brake;
    bus.emit('input', { pitch, roll, throttle, brake, src: panel && panel.isConnected && (touch.pitch || touch.roll || touch.brake) ? 'touch' : 'keys' });
  }
  setInterval(tick, 1000 / 30);

  // On-screen controls if no yoke within 10 s.
  setTimeout(() => { if (!yokeSeen) showPanel(); }, 10000);

  function showPanel() {
    if (panel) { panel.hidden = false; return; }
    panel = document.createElement('div');
    panel.className = 'touchpad';
    panel.innerHTML = `
      <div class="tp-pad">
        <button data-p="1" data-r="0" class="tp-up">▲</button>
        <button data-p="0" data-r="-1" class="tp-left">◀</button>
        <button data-p="0" data-r="1" class="tp-right">▶</button>
        <button data-p="-1" data-r="0" class="tp-down">▼</button>
      </div>
      <label class="tp-thr">THR<input type="range" min="0" max="100" value="0" orient="vertical"></label>
      <button class="tp-brake">BRAKE</button>`;
    document.body.appendChild(panel);
    for (const b of panel.querySelectorAll('[data-p]')) {
      const on = e => { e.preventDefault(); touch.pitch = +b.dataset.p; touch.roll = +b.dataset.r; lastLocal = performance.now(); };
      const off = () => { touch.pitch = 0; touch.roll = 0; };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off);
    }
    const thr = panel.querySelector('input');
    thr.addEventListener('input', () => { throttle = thr.value / 100; lastLocal = performance.now(); });
    setInterval(() => { if (document.activeElement !== thr) thr.value = Math.round(throttle * 100); }, 300);
    const br = panel.querySelector('.tp-brake');
    br.addEventListener('pointerdown', () => { touch.brake = true; lastLocal = performance.now(); });
    br.addEventListener('pointerup', () => { touch.brake = false; });
  }
  function hidePanel() { if (panel) panel.hidden = true; }
}

const clamp = v => Math.max(-1, Math.min(1, v));
