// Mock aircraft feed: a virtual flight clock with warp + jump-to-phase.
const MIN = 60 * 1000;

function createClock({ routes, defaultRoute, todMin = 30, onChange }) {
  let route = routes.find(r => r.id === defaultRoute) || routes[0];
  let depMs, arrMs, nowMs, warp = 1, lastReal = Date.now();

  function reset() {
    const real = Date.now();
    nowMs = real;
    depMs = real + 2 * MIN;
    arrMs = depMs + route.blockMin * MIN;
    lastReal = real;
  }

  function tick() {
    const real = Date.now();
    nowMs += (real - lastReal) * warp;
    lastReal = real;
  }

  function snapshot() {
    tick();
    return {
      depMs, arrMs, nowMs, warp,
      progress: (nowMs - depMs) / (arrMs - depMs),
      routeId: route.id,
      route,                 // full route, so seats can fly custom (non-featured) routes
    };
  }

  function changed() { onChange && onChange(snapshot()); }

  function setWarp(value) {
    tick();
    const v = Number(value);
    warp = Number.isFinite(v) && v > 0 ? v : 1;
    changed();
  }

  /** @param r routeId of a featured route, or a full route object (custom picker) */
  function setRoute(r) {
    if (typeof r === 'string') r = routes.find(x => x.id === r);
    if (!r) return false;
    route = r;
    reset();
    changed();
    return true;
  }

  // Sets virtual now so the seat lands in the requested phase.
  function jump(phase) {
    tick();
    switch (phase) {
      case 'INTRO': nowMs = depMs - 2 * MIN; break;
      case 'GATE': nowMs = depMs - 1 * MIN; break;
      case 'TAKEOFF': nowMs = depMs; break;
      case 'CRUISE': nowMs = depMs + 0.4 * (arrMs - depMs); break;
      case 'DESCENT_CALL': nowMs = arrMs - todMin * MIN; break;
      case 'APPROACH': nowMs = arrMs - 8 * MIN; break;
      case 'LANDED':
      case 'CERTIFICATE': nowMs = arrMs; break;
      default: return false;
    }
    changed();
    return true;
  }

  reset();
  setInterval(changed, 1000);

  return { snapshot, setWarp, setRoute, jump, get route() { return route; }, reset: () => { warp = 1; reset(); changed(); } };
}

module.exports = { createClock };
