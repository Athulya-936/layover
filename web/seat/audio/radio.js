// Radio voice: bandpass + light distortion chain, squelch click + noise bursts, clip-or-TTS.
let ctx = null;
const clipCache = new Map();   // id -> AudioBuffer | null
const queue = [];
let busy = false;

export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* no audio */ }
  // iOS/Chrome need a speech call inside the gesture to unlock TTS.
  try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch { /* ignore */ }
}

function chain() {
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.7;
  const ws = ctx.createWaveShaper();
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2); }
  ws.curve = curve;
  const gain = ctx.createGain(); gain.gain.value = 0.9;
  bp.connect(ws); ws.connect(gain); gain.connect(ctx.destination);
  return bp;
}

function noiseBurst(ms = 120, vol = 0.25) {
  if (!ctx) return Promise.resolve();
  const len = Math.floor(ctx.sampleRate * ms / 1000);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (i < 40 ? 1 : vol); // click then hiss
  const src = ctx.createBufferSource(); src.buffer = buf;
  src.connect(chain()); src.start();
  return new Promise(r => setTimeout(r, ms));
}

async function loadClip(id) {
  if (clipCache.has(id)) return clipCache.get(id);
  let buf = null;
  try {
    const res = await fetch(`./audio/clips/${id}.mp3`);
    if (res.ok && ctx) buf = await ctx.decodeAudioData(await res.arrayBuffer());
  } catch { buf = null; }
  clipCache.set(id, buf);
  return buf;
}

function playBuffer(buf) {
  return new Promise(resolve => {
    const src = ctx.createBufferSource(); src.buffer = buf;
    src.connect(chain()); src.onended = resolve; src.start();
  });
}

function speak(text) {
  return new Promise(resolve => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05; u.pitch = 0.95;
      const v = speechSynthesis.getVoices().find(v => /en[-_](GB|IN|US)/i.test(v.lang));
      if (v) u.voice = v;
      const done = () => { clearTimeout(guard); resolve(); };
      const guard = setTimeout(done, 9000);
      u.onend = done; u.onerror = done;
      speechSynthesis.speak(u);
    } catch { resolve(); }
  });
}

async function playOne({ id, text, speech }) {
  if (ctx && ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* ignore */ } }
  await noiseBurst();
  const buf = ctx ? await loadClip(id) : null;
  if (buf) await playBuffer(buf);
  else await speak(speech || text);
  await noiseBurst();
}

async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) await playOne(queue.shift());
  busy = false;
}

/** Queue a radio line. Deviation calls drop if the channel is already busy. */
export function say(atc, { droppable = false } = {}) {
  if (droppable && (busy || queue.length)) return;
  if (queue.length > 2) queue.splice(0, queue.length - 2); // keep the radio from lagging behind
  queue.push(atc);
  pump();
}

export function initRadio(bus) {
  const DROP = new Set(['high', 'low', 'fast', 'slow', 'centre']);
  bus.on('atc', a => say(a, { droppable: DROP.has(a.id) }));
}
