// Glide-path rings: 8 rings on the 3° path from 8 km to 600 m before the threshold. Owner: Person A.
import { localToWorld } from './frame.js';
import { GLIDE } from './assist.js';

const N = 8, FAR = 8000, NEAR = 600, RADIUS = 25, HIT = 30;

export function createRings(viewer) {
  const Cesium = window.Cesium;
  let rings = [];          // {along, z, entity, passed}
  let next = 0;

  function clear() { rings.forEach(r => viewer.entities.remove(r.entity)); rings = []; next = 0; }

  /** Build rings for a runway whose origin/heading define the local frame. */
  function build(origin, hdgRad) {
    clear();
    const fx = Math.sin(hdgRad), fy = Math.cos(hdgRad);      // forward (along runway)
    const rx = Math.cos(hdgRad), ry = -Math.sin(hdgRad);     // right of centreline
    for (let i = 0; i < N; i++) {
      const dist = FAR - (FAR - NEAR) * (i / (N - 1));
      const cz = dist * Math.tan(GLIDE);
      const cx = -dist * fx, cy = -dist * fy;
      const pts = [];
      for (let k = 0; k <= 32; k++) {
        const a = (k / 32) * 2 * Math.PI;
        pts.push(localToWorld(origin, cx + rx * RADIUS * Math.cos(a), cy + ry * RADIUS * Math.cos(a), cz + RADIUS * Math.sin(a)));
      }
      const entity = viewer.entities.add({
        polyline: { positions: pts, width: 6, material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.25, color: Cesium.Color.GOLD }) },
      });
      rings.push({ along: -dist, z: cz, entity, passed: false });
    }
  }

  function show(on) { rings.forEach(r => (r.entity.show = on)); }

  /** Call every physics step. Returns {index,total} when a ring is passed, else null. */
  function update(alongM, crossM, z, hitRadius = HIT) {
    const r = rings[next];
    if (!r || alongM < r.along) return null;
    next++;
    const hit = Math.hypot(crossM, z - r.z) <= hitRadius;
    r.passed = hit;
    r.entity.polyline.material = new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.3, color: hit ? Cesium.Color.LIME : Cesium.Color.RED.withAlpha(0.6) });
    return hit ? { index: next - 1, total: N } : null;   // 0-based, like the contract
  }

  return { build, clear, show, update, get allPassed() { return rings.length > 0 && rings.every(r => r.passed); } };
}
