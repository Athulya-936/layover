// Coordinate helpers between our local runway frame (metres) and Cesium. Owner: Person A.
const C = () => window.Cesium;

/** Local East-North-Up origin at lat/lon, h = ellipsoid height of the ground there. */
export function makeOrigin(lat, lon, h) {
  const Cesium = C();
  const cart = Cesium.Cartesian3.fromDegrees(lon, lat, h);
  return { lat, lon, h, cart, frame: Cesium.Transforms.eastNorthUpToFixedFrame(cart) };
}

export function localToWorld(origin, x, y, z, result) {
  const Cesium = C();
  return Cesium.Matrix4.multiplyByPoint(origin.frame, new Cesium.Cartesian3(x, y, z), result || new Cesium.Cartesian3());
}

export function toLatLonH(cart) {
  const Cesium = C();
  const c = Cesium.Cartographic.fromCartesian(cart);
  return { lat: Cesium.Math.toDegrees(c.latitude), lon: Cesium.Math.toDegrees(c.longitude), h: c.height };
}

/**
 * Real ground height (ellipsoidal) at a point. Do NOT use airport elevFt:
 * that is above sea level, Cesium uses the ellipsoid, and around India they differ by tens of metres.
 */
export async function groundHeight(viewer, lat, lon) {
  const [h] = await groundHeights(viewer, [[lat, lon]]);
  return h;
}

/** Several points at once: [[lat, lon], ...] → [h, ...]. Falls back to 0 (flat globe) per point. */
export async function groundHeights(viewer, pts) {
  const Cesium = C();
  try {
    const out = await Promise.race([
      Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, pts.map(([lat, lon]) => Cesium.Cartographic.fromDegrees(lon, lat))),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
    ]);
    return out.map(c => (Number.isFinite(c.height) ? c.height : 0));
  } catch (e) {
    console.warn('[sim] terrain sample failed, using 0', e.message);
    return pts.map(() => 0);
  }
}

/**
 * Find a runway end in airports.json: {iata, runways:[{lengthFt, ends:[{id,lat,lon,hdg,elevFt}]}]}.
 * Returns the threshold `end`, the opposite end `far`, the TRUE bearing threshold → far end (the
 * `hdg` in the data is rounded/magnetic and can be a degree or two off the painted runway) and length.
 * `airports` may be the raw array or an {IATA: airport} map.
 */
export function findRunway(airports, iata, rwyId) {
  const ap = Array.isArray(airports) ? airports.find(a => a.iata === iata) : airports[iata];
  if (!ap) throw new Error(`airport ${iata} not in airports.json`);
  let rwy = ap.runways.find(r => r.ends.some(e => e.id === rwyId));
  if (!rwy) {
    rwy = ap.runways[0];
    console.warn(`[sim] runway ${rwyId} not found at ${iata}, using ${rwy.ends[0].id}`);
  }
  const end = rwy.ends.find(e => e.id === rwyId) || rwy.ends[0];
  const far = rwy.ends.find(e => e !== end);
  const geomOk = far && (far.lat !== end.lat || far.lon !== end.lon);
  return {
    airport: ap, end, far,
    hdgDeg: geomOk ? bearingDeg(end.lat, end.lon, far.lat, far.lon) : end.hdg,
    lengthM: geomOk ? haversineKm(end.lat, end.lon, far.lat, far.lon) * 1000 : rwy.lengthFt * 0.3048,
  };
}

/** Initial great-circle bearing in degrees. */
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}
