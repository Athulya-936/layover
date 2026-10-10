// Landing grade + pilot logbook + TVG QR.
import { renderQR, tvgUrl } from './wherenext.js';

const GRADE_TEXT = { BUTTER: 'Butter landing!', FIRM: 'Firm landing', HARD: 'Hard landing (but safe!)', GO_AROUND: 'Go around' };

function km(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function createCertificate({ bus, config, airports, onFlyAgain, onWhereNext }) {
  const el = document.createElement('div');
  el.className = 'overlay certificate'; el.hidden = true;
  document.body.appendChild(el);

  function show({ route, save }) {
    const td = save.touchdown || { grade: 'BUTTER', stars: 3, vsMs: -1.2 };
    const A = airports[route.from], B = airports[route.to];
    const dist = A && B ? km(A, B) : 0;
    const stars = '★'.repeat(td.stars) + '☆'.repeat(3 - td.stars);
    const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    el.innerHTML = `
      <div class="cert">
        <div class="cert-head">VALKYRIE · PILOT CERTIFICATE</div>
        <div class="stars">${stars}</div>
        <div class="grade">${GRADE_TEXT[td.grade] || td.grade}</div>
        <div class="vs">Touchdown ${Math.abs(td.vsMs * 196.85).toFixed(0)} fpm</div>
        <div class="logbook">
          <div><span>Flight</span><b>${route.flightNo}</b></div>
          <div><span>Route</span><b>${A?.city || route.from} → ${B?.city || route.to}</b></div>
          <div><span>Runways</span><b>${route.depRwy} → ${route.arrRwy}</b></div>
          <div><span>Distance</span><b>${dist.toLocaleString()} km</b></div>
          <div><span>Date</span><b>${date}</b></div>
        </div>
        <div class="badges">${(save.badges || []).map(b => `<span class="badge">🏅 ${b}</span>`).join('') || '<span class="muted">Fly again to earn badges</span>'}</div>
        <div class="cert-foot">
          <div class="cert-qr"></div>
          <div class="cert-cta"><b>Where next?</b><br>Get your visa sorted with The Visa Guy.<br><small>Scan with your phone</small>
            <div class="cert-buttons"><button class="wn">More destinations</button><button class="again">Fly again</button></div>
          </div>
        </div>
      </div>`;
    renderQR(el.querySelector('.cert-qr'), tvgUrl(config, { content: 'certificate', flightNo: route.flightNo }), 150);
    el.querySelector('.again').onclick = onFlyAgain;
    el.querySelector('.wn').onclick = onWhereNext;
    el.hidden = false;
  }

  bus.on('phase', ({ phase }) => { if (phase !== 'CERTIFICATE') el.hidden = true; });
  return { show, hide: () => { el.hidden = true; } };
}
