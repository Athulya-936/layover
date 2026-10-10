// "Where next?" — The Visa Guy destination cards + QR tagged utm_source=seatback.
const DESTS = [
  { city: 'London', emoji: '🇬🇧', tag: 'london', blurb: 'Theatre, tea and the Tube' },
  { city: 'Paris', emoji: '🇫🇷', tag: 'paris', blurb: 'Croissants under the Eiffel Tower' },
  { city: 'Tokyo', emoji: '🇯🇵', tag: 'tokyo', blurb: 'Neon nights and cherry blossoms' },
  { city: 'New York', emoji: '🇺🇸', tag: 'new-york', blurb: 'The city that never sleeps' },
  { city: 'Istanbul', emoji: '🇹🇷', tag: 'istanbul', blurb: 'Where two continents meet' },
  { city: 'Singapore', emoji: '🇸🇬', tag: 'singapore', blurb: 'Gardens, hawkers and skyline' },
];

export function tvgUrl(config, { content, flightNo }) {
  const u = new URL(config.QR_BASE);
  for (const [k, v] of Object.entries(config.QR_PARAMS)) u.searchParams.set(k, v);
  if (content) u.searchParams.set('utm_content', content);
  if (flightNo) u.searchParams.set('ref', flightNo);
  return u.toString();
}

export function renderQR(el, text, size = 220) {
  el.innerHTML = '';
  if (window.QRCode) new window.QRCode(el, { text, width: size, height: size, colorDark: '#0a1224', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
  else el.textContent = text;
}

export function createWhereNext({ config, getRoute }) {
  const el = document.createElement('div');
  el.className = 'overlay wherenext'; el.hidden = true;
  el.innerHTML = `
    <div class="panel">
      <button class="close" aria-label="Close">✕</button>
      <h2>Where next?</h2>
      <p class="lede">Pick your next adventure. Scan to check your visa with <b>The Visa Guy</b>.</p>
      <div class="cards"></div>
      <div class="qrview" hidden>
        <div class="qr-big"></div>
        <div class="qr-copy"><div class="qr-city"></div><div>Scan with your phone to check your visa with The Visa Guy.</div><button class="back">← All destinations</button></div>
      </div>
      <div class="powered">Powered by The Visa Guy</div>
    </div>`;
  document.body.appendChild(el);
  const cards = el.querySelector('.cards'), qrv = el.querySelector('.qrview');
  for (const d of DESTS) {
    const c = document.createElement('button');
    c.className = 'dest';
    c.innerHTML = `<span class="emoji">${d.emoji}</span><span class="city">${d.city}</span><span class="blurb">${d.blurb}</span><span class="cta">Check your visa →</span>`;
    c.onclick = () => showQR(d);
    cards.appendChild(c);
  }
  function showQR(d) {
    cards.hidden = true; qrv.hidden = false;
    el.querySelector('.qr-city').textContent = `${d.emoji} ${d.city} next?`;
    renderQR(el.querySelector('.qr-big'), tvgUrl(config, { content: d.tag, flightNo: getRoute().flightNo }), 260);
  }
  el.querySelector('.back').onclick = () => { cards.hidden = false; qrv.hidden = true; };
  el.querySelector('.close').onclick = () => close();
  function open() { cards.hidden = false; qrv.hidden = true; el.hidden = false; }
  function close() { el.hidden = true; }
  return { open, close };
}
