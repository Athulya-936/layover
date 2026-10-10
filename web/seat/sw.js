// Tile cache for the seat: once the demo route has been flown, it survives a dead hotspot.
// - Cesium library, imagery (Bing), terrain + OSM buildings (ion), QR lib: cache-first.
// - ion endpoint JSON (hands out short-lived tokens): network-first, cached copy when offline.
// - Our own files (same origin): never cached here, so code changes always show up.
// - Google Photorealistic tiles: never cached (their terms don't allow it).
const CACHE = 'valkyrie-tiles-v1';
const MAX_ENTRIES = 30000, TRIM_TO = 26000;
const CACHE_FIRST = [
  /^https:\/\/cesium\.com\/downloads\/cesiumjs\//,
  /^https:\/\/assets\.ion\.cesium\.com\//,
  /^https:\/\/assets\.cesium\.com\//,
  /^https:\/\/[^/]*\.virtualearth\.net\//,
  /^https:\/\/cdnjs\.cloudflare\.com\//,
  /^https:\/\/cdn\.jsdelivr\.net\//,
];
const NETWORK_FIRST = [/^https:\/\/api\.cesium\.com\//];
const VOLATILE_PARAMS = ['access_token', 'key', 'token', 'session'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

/** Same tile, different session token → same cache entry. */
function cacheKey(url) {
  const u = new URL(url);
  for (const p of VOLATILE_PARAMS) u.searchParams.delete(p);
  return u.toString();
}

let puts = 0;
async function store(cache, key, res) {
  if (!res || !(res.ok || res.type === 'opaque')) return;
  await cache.put(key, res);
  if (++puts % 500 === 0) {
    const keys = await cache.keys();
    if (keys.length > MAX_ENTRIES) await Promise.all(keys.slice(0, keys.length - TRIM_TO).map(k => cache.delete(k)));
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const key = cacheKey(req.url);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(req);
  store(cache, key, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const key = cacheKey(req.url);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
    store(cache, key, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;
  if (CACHE_FIRST.some(r => r.test(url))) e.respondWith(cacheFirst(req));
  else if (NETWORK_FIRST.some(r => r.test(url))) e.respondWith(networkFirst(req));
});

// The admin/seat can ask how much is cached: postMessage('count') → {count}
self.addEventListener('message', async e => {
  if (e.data === 'count') {
    const keys = await (await caches.open(CACHE)).keys();
    e.source && e.source.postMessage({ cached: keys.length });
  }
});
