// Radio read-back: after a clearance (takeoff / landing) the passenger can say it back.
// Uses the browser's SpeechRecognition (Chrome; needs internet). Hidden where unsupported.
import { READBACK, fill } from '../audio/lines.js';

const DIGIT_WORDS = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', niner: '9', to: '2', too: '2', for: '4', won: '1' };
const KEYWORD = { takeoff: /take ?off/, land: /land/ };
const OFFER_MS = 12000, LISTEN_MS = 6000;
const PHASE_OF = { takeoff: 'TAKEOFF', land: 'APPROACH' };   // only offer while that clearance still applies

const TENS = { ten: 1, twenty: 2, thirty: 3 };   // runway numbers are 01–36
/** Heard text → lower-case words with spoken digits turned into numerals. */
export function normalise(text) {
  const words = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map(w => DIGIT_WORDS[w] ?? w);
  // "twenty eight" → 28, "thirty" → 30
  return words.map((w, i) => (w in TENS ? (/^\d$/.test(words[i + 1] || '') ? String(TENS[w]) : `${TENS[w]}0`) : w)).join(' ');
}

/** Did they read back the clearance? Needs "cleared", the action and the runway number. */
export function checkReadback(id, heard, route) {
  const n = normalise(heard);
  const rwy = (id === 'takeoff' ? route.depRwy : route.arrRwy).replace(/\D/g, '');
  const digits = n.replace(/[^0-9]/g, '');
  return /clear/.test(n) && KEYWORD[id].test(n) && digits.includes(rwy);
}

export function createReadback({ bus, config, getRoute, send }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  const el = document.createElement('div');
  el.className = 'readback'; el.hidden = true;
  el.innerHTML = '<button class="rb-mic">🎙️ Read it back</button><div class="rb-say"></div><div class="rb-heard"></div>';
  document.body.appendChild(el);
  const mic = el.querySelector('.rb-mic'), heardEl = el.querySelector('.rb-heard');
  let current = null, offerTimer = null, rec = null, phase = null;

  function offer(id) {
    current = id;
    el.querySelector('.rb-say').textContent = `Say: “${fill(READBACK[id], config, getRoute(), false)}”`;
    heardEl.textContent = '';
    mic.disabled = false; mic.textContent = '🎙️ Read it back';
    el.hidden = false;
    clearTimeout(offerTimer);
    offerTimer = setTimeout(close, OFFER_MS);
  }
  function close() { el.hidden = true; current = null; try { rec && rec.abort(); } catch { /* ignore */ } }

  mic.onclick = () => {
    if (!current) return;
    clearTimeout(offerTimer);
    const id = current;
    rec = new SR();
    rec.lang = 'en-US'; rec.interimResults = true; rec.maxAlternatives = 3;
    let best = '';
    mic.disabled = true; mic.textContent = '🔴 Listening…';
    rec.onresult = e => {
      const r = e.results[e.results.length - 1];
      best = [...r].map(a => a.transcript).find(t => checkReadback(id, t, getRoute())) || r[0].transcript;
      heardEl.textContent = `“${best}”`;
    };
    const finish = () => {
      const ok = !!best && checkReadback(id, best, getRoute());
      send && send({ t: 'readback', id, heard: best, ok });
      if (ok) { bus.emit('readback:ok', { id }); mic.textContent = '✅ Readback correct'; setTimeout(close, 2500); }
      else { mic.disabled = false; mic.textContent = best ? '🔁 Say again' : '🎙️ Try again'; offerTimer = setTimeout(close, OFFER_MS); }
    };
    rec.onend = finish;
    rec.onerror = () => {};
    try { rec.start(); setTimeout(() => { try { rec.stop(); } catch { /* ignore */ } }, LISTEN_MS); } catch { finish(); }
  };

  bus.on('atc:done', ({ id }) => { if (READBACK[id] && PHASE_OF[id] === phase) offer(id); });
  bus.on('phase', ({ phase: p }) => { phase = p; if (current && PHASE_OF[current] !== p) close(); });
}
