// Intro: Start (unlocks audio) → Captain Vee waves → passport → VISA APPROVED stamp → boarding pass.
export function createIntro({ airports, onDone, onStart, onPick }) {
  const el = document.createElement('div');
  el.className = 'overlay intro'; el.hidden = true;
  document.body.appendChild(el);
  let timers = [], done = false;

  function clear() { timers.forEach(clearTimeout); timers = []; }
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));

  function show(route) {
    done = false; clear();
    const cityOf = iata => (airports[iata]?.city || iata).split('/')[0].trim();
    const A = { city: cityOf(route.from) }, B = { city: cityOf(route.to) };
    el.innerHTML = `
      <div class="intro-start">
        <div class="logo">VALKYRIE</div>
        <div class="tag">Fly your flight · ${A.city} → ${B.city}</div>
        <button class="start">▶ Start</button>
        ${onPick ? '<button class="pick">🌍 Change flight: fly from anywhere</button>' : ''}
      </div>
      <div class="intro-stage" hidden>
        <div class="vee">
          <img src="./img/captain-vee-wave.png" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'vee-emoji',textContent:'🧑‍✈️'}))">
          <div class="vee-says">Hi, I'm Captain Vee! Today <b>you</b> fly us to ${B.city}.</div>
        </div>
        <div class="flip">
          <div class="passport">
            <div class="pp-title">PASSPORT</div>
            <div class="pp-line">Destination: ${B.city}</div>
            <div class="pp-line">Flight: ${route.flightNo}</div>
            <div class="stamp">VISA<br>APPROVED</div>
          </div>
          <div class="bpass">
            <div class="bp-head"><span>BOARDING PASS</span><span>${route.flightNo}</span></div>
            <div class="bp-route"><div><b>${route.from}</b><small>${A.city}</small></div><div class="bp-plane">✈</div><div><b>${route.to}</b><small>${B.city}</small></div></div>
            <div class="bp-grid"><div><small>Seat</small><b>PILOT</b></div><div><small>Runway</small><b>${route.depRwy}</b></div><div><small>Class</small><b>Captain</b></div></div>
          </div>
        </div>
        <button class="skip" hidden>Skip ›</button>
      </div>
      <div class="intro-foot">Powered by The Visa Guy</div>`;
    el.hidden = false;
    el.querySelector('.start').onclick = () => { onStart && onStart(); run(); };
    if (onPick) el.querySelector('.pick').onclick = onPick;
  }

  function run() {
    el.querySelector('.intro-start').hidden = true;
    const st = el.querySelector('.intro-stage'); st.hidden = false;
    const skip = el.querySelector('.skip');
    skip.onclick = finish;
    at(1000, () => { skip.hidden = false; });
    at(1500, () => st.classList.add('s-passport'));
    at(3200, () => st.classList.add('s-stamp'));
    at(5800, () => st.classList.add('s-flip'));
    at(10000, finish);
  }

  function finish() {
    if (done) return; done = true; clear();
    el.classList.add('out');
    setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 400);
    onDone && onDone();
  }

  return { show, skip: () => { if (!el.hidden) finish(); }, get visible() { return !el.hidden; } };
}
