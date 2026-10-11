// Chase / cockpit / orbit cameras with smoothing. Owner: Person A.
const D = Math.PI / 180;
const ORBIT_DEG_PER_S = 10;

export function createCamera(viewer) {
  const Cesium = window.Cesium;
  let kind = 'chase';
  let smoothHdg = null;
  let range = 70;
  let orbit = 0;
  let swooping = false;

  function set(k) {
    if (!['chase', 'cockpit', 'orbit'].includes(k)) k = 'chase';
    if (k === 'orbit' && kind !== 'orbit') orbit = 0;
    kind = k;
  }

  /** @param pos Cartesian3, hdgDeg compass, pitchRad/rollRad of the plane, cruise = high-altitude framing */
  function update(pos, hdgDeg, pitchRad, rollRad, dt, cruise = false) {
    if (swooping) return;
    const h = hdgDeg * D;
    if (smoothHdg === null) smoothHdg = h;
    const diff = Math.atan2(Math.sin(h - smoothHdg), Math.cos(h - smoothHdg));
    smoothHdg += diff * Math.min(1, dt * 3);
    const wantRange = kind === 'orbit' ? 110 : cruise ? 250 : 70;
    range += (wantRange - range) * Math.min(1, dt * 1.5);

    if (kind === 'chase') {
      viewer.camera.lookAt(pos, new Cesium.HeadingPitchRange(smoothHdg, -0.18, range));
    } else if (kind === 'orbit') {
      orbit += ORBIT_DEG_PER_S * D * dt;
      viewer.camera.lookAt(pos, new Cesium.HeadingPitchRange(smoothHdg + orbit, -0.3, range));
    } else if (kind === 'cockpit') {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
      const fwd = new Cesium.Cartesian3(Math.sin(h) * 4, Math.cos(h) * 4, 1.5);
      const eye = Cesium.Matrix4.multiplyByPoint(enu, fwd, new Cesium.Cartesian3());
      viewer.camera.setView({ destination: eye, orientation: { heading: h, pitch: pitchRad, roll: rollRad } });
    }
  }

  /** Swoop up to a globe view of the whole route, then hand back to the previous camera. */
  function flyOverview(rect, ms = 4000) {
    return new Promise(res => {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      swooping = true;
      viewer.camera.flyTo({
        destination: rect, duration: ms / 1000,
        complete: () => setTimeout(() => { swooping = false; smoothHdg = null; res(); }, 2500),
        cancel: () => { swooping = false; res(); },
      });
    });
  }

  return { set, update, flyOverview, get kind() { return kind; } };
}
