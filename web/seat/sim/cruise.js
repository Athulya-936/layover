// Cruise: follow the great-circle route at 11,000 m at the real flight's progress. Owner: Person A.
import { bearingDeg } from './frame.js';

export const CRUISE_ALT = 11000;

export function createCruise(viewer) {
  const Cesium = window.Cesium;
  let geo = null, line = null, from = null, to = null;
  let shown = 0;     // smoothed progress actually displayed
  let target = 0;

  function setRoute(fromAp, toAp) {
    from = fromAp; to = toAp;
    geo = new Cesium.EllipsoidGeodesic(
      Cesium.Cartographic.fromDegrees(from.lon, from.lat),
      Cesium.Cartographic.fromDegrees(to.lon, to.lat));
    if (line) viewer.entities.remove(line);
    line = viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([from.lon, from.lat, CRUISE_ALT, to.lon, to.lat, CRUISE_ALT]),
        arcType: Cesium.ArcType.GEODESIC, width: 3,
        material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.CYAN }),
      },
    });
  }

  function showLine(on) { if (line) line.show = on; }
  function setProgress(p, snap = false) { target = Math.max(0, Math.min(1, p)); if (snap) shown = target; }

  /** Advance the smoothed progress and return {lat, lon, h, headingDeg}. */
  function update(dt) {
    shown += (target - shown) * Math.min(1, dt * 1.5);
    const D = Cesium.Math.toDegrees;
    const a = geo.interpolateUsingFraction(shown);
    const lat = D(a.latitude), lon = D(a.longitude);
    // Heading from a point just ahead (or just behind, at the very end of the route)
    const ahead = shown < 0.999;
    const b = geo.interpolateUsingFraction(ahead ? shown + 0.001 : shown - 0.001);
    const headingDeg = ahead ? bearingDeg(lat, lon, D(b.latitude), D(b.longitude)) : bearingDeg(D(b.latitude), D(b.longitude), lat, lon);
    return { lat, lon, h: CRUISE_ALT, headingDeg };
  }

  /** Rectangle around the whole route, for the overview swoop. */
  function overviewRect() {
    const pad = 3;
    return Cesium.Rectangle.fromDegrees(
      Math.min(from.lon, to.lon) - pad, Math.min(from.lat, to.lat) - pad,
      Math.max(from.lon, to.lon) + pad, Math.max(from.lat, to.lat) + pad);
  }

  return { setRoute, setProgress, update, showLine, overviewRect, get progress() { return shown; } };
}
