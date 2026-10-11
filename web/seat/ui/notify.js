// Toasts + Captain Vee speech bubbles (Kid Mode).
let wrap = null, bubble = null, bubbleTimer = null;

function ensure() {
  if (wrap) return;
  wrap = document.createElement('div'); wrap.className = 'toasts'; document.body.appendChild(wrap);
  bubble = document.createElement('div'); bubble.className = 'vee-bubble'; bubble.hidden = true;
  bubble.innerHTML = '<div class="vee-face">🧑‍✈️</div><div class="vee-text"></div>';
  document.body.appendChild(bubble);
}

/** toast(text, {title, actions:[{label, fn, primary}], ttl, kind}) → close() */
export function toast(text, { title = '', actions = [], ttl = 5000, kind = '' } = {}) {
  ensure();
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${title ? `<div class="toast-title">${title}</div>` : ''}<div class="toast-text"></div><div class="toast-actions"></div>`;
  el.querySelector('.toast-text').textContent = text;
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  for (const a of actions) {
    const b = document.createElement('button');
    b.textContent = a.label; if (a.primary) b.className = 'primary';
    b.onclick = () => { close(); a.fn && a.fn(); };
    el.querySelector('.toast-actions').appendChild(b);
  }
  wrap.appendChild(el);
  if (ttl) setTimeout(close, ttl);
  return close;
}

export function vee(text, ms = 4500) {
  ensure();
  bubble.querySelector('.vee-text').textContent = text;
  bubble.hidden = false;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.hidden = true; }, ms);
}

export function initNotify(bus) {
  let kid = true;
  bus.on('kid', ({ on }) => { kid = on; toast(on ? 'Kid Mode ON: the plane helps you fly' : 'Pilot Mode: no assists', { ttl: 2500 }); });
  bus.on('mission', ({ text, done }) => { if (kid) vee(text, 5000); else toast(text, { title: done ? '✅ Mission' : '🎯 Mission', ttl: 5000 }); });
  bus.on('badge', ({ name }) => toast(name, { title: '🏅 Badge earned', ttl: 3500, kind: 'badge' }));
  bus.on('flight:ring', ({ index, total }) => { if (kid) vee(index + 1 >= total ? 'All rings! Now gently down to the runway…' : `Ring ${index + 1} of ${total}! Keep going!`, 2000); });
  bus.on('flight:touchdown', td => { if (td.grade === 'GO_AROUND') toast('Go around! Let\'s set you up for another try…', { title: 'Missed it', ttl: 3000 }); });
  bus.on('phase', ({ phase }) => {
    if (!kid) return;
    if (phase === 'TAKEOFF') vee('Push the thrust all the way up, then pull back gently when we\'re fast!');
    if (phase === 'APPROACH') vee('Fly through the rings!');
    if (phase === 'CRUISE') vee('Autopilot is on. Sit back, or check out Where Next!');
  });
}
