// Cesium viewer with real terrain + OSM 3D buildings, tuned for frame rate. Owner: Person A.
// Layers, bottom to top:
//   NaturalEarthII (ships inside Cesium, works with no ion access) → Bing satellite via ion → OSM buildings.
// Optional: Google Photorealistic 3D Tiles (setPhotoreal), which replaces globe + buildings while on.
export const PERF = {
  maximumScreenSpaceError: 4,   // starting detail; auto-perf raises it if the frame rate drops
  resolutionScale: 0.9,
  autoPerf: true,               // step quality down/up automatically to stay smooth
  targetFps: 50,                // below this for a few seconds → lower quality
  sceneTimeUtc: '2026-03-20T07:30:00Z',   // lighting time (≈ noon IST / 11:30 Dubai)
};
// Quality ladder for auto-perf: level 0 = prettiest. Each step is cheaper on the GPU.
const LEVELS = [
  { sse: 4, res: 0.9, buildings: true },
  { sse: 6, res: 0.8, buildings: true },
  { sse: 8, res: 0.7, buildings: true },
  { sse: 12, res: 0.6, buildings: false },
  { sse: 16, res: 0.5, buildings: false },
];

export async function createWorld(containerId, config) {
  const Cesium = window.Cesium;
  if (!Cesium) throw new Error('Cesium not loaded: check the <script> tag / internet');
  if (!config.CESIUM_TOKEN || config.CESIUM_TOKEN.startsWith('PASTE')) {
    console.error('[sim] Put your Cesium ion token in web/shared/config.js');
  }
  Cesium.Ion.defaultAccessToken = config.CESIUM_TOKEN;

  let baseLayer = false;
  try {
    baseLayer = Cesium.ImageryLayer.fromProviderAsync(
      Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII')));
  } catch (e) { console.warn('[sim] NaturalEarthII unavailable', e); }

  const viewer = new Cesium.Viewer(containerId, {
    terrain: Cesium.Terrain.fromWorldTerrain(),
    baseLayer,
    animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
    homeButton: false, sceneModePicker: false, navigationHelpButton: false,
    fullscreenButton: false, infoBox: false, selectionIndicator: false,
    shadows: false,
    msaaSamples: 1,                       // Cesium defaults to 4× MSAA: very heavy on laptop GPUs
    useBrowserRecommendedResolution: true, // render at CSS pixels, not 2× Retina pixels
  });
  // Satellite imagery on top; if ion is unreachable the NaturalEarth globe still shows.
  try { viewer.imageryLayers.add(Cesium.ImageryLayer.fromWorldImagery()); } catch (e) { console.warn('[sim] world imagery unavailable', e); }

  // Wait until the terrain provider is ready (needed for height sampling)
  await new Promise(res => {
    if (viewer.terrainProvider && !(viewer.terrainProvider instanceof Cesium.EllipsoidTerrainProvider)) return res();
    const remove = viewer.scene.globe.terrainProviderChanged.addEventListener(() => { remove(); res(); });
    setTimeout(res, 8000); // offline: carry on with the flat ellipsoid
  });

  let buildings = null;
  Cesium.createOsmBuildingsAsync()
    .then(b => { buildings = b; viewer.scene.primitives.add(b); b.show = !photoreal; })
    .catch(e => console.warn('[sim] OSM buildings unavailable', e));

  // ---- Performance: smooth > pretty ----
  const scene = viewer.scene;
  scene.globe.maximumScreenSpaceError = PERF.maximumScreenSpaceError;
  scene.fog.enabled = true;
  scene.fog.density = 0.0002;
  scene.globe.enableLighting = false;
  // Always fly in daylight: Cesium lights the model and sky from the real sun position, so a
  // night-time rehearsal looks dark. Freeze the scene clock at midday over India / the Gulf (07:30 UTC).
  viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(PERF.sceneTimeUtc);
  viewer.clock.shouldAnimate = false;
  scene.globe.depthTestAgainstTerrain = true;
  scene.highDynamicRange = false;
  viewer.resolutionScale = PERF.resolutionScale;
  scene.postProcessStages.fxaa.enabled = false;
  scene.globe.tileCacheSize = 1000;          // keep more tiles in memory: fewer re-loads when the camera swings
  // Keep Cesium's credit line visible (required by the Cesium ion / data terms); it's small.

  // Don't let mouse drags fight our camera
  const ctl = scene.screenSpaceCameraController;
  ctl.enableRotate = ctl.enableTranslate = ctl.enableZoom = ctl.enableTilt = ctl.enableLook = false;

  // ---- Google Photorealistic 3D Tiles (optional, heavy) ----
  let photoreal = false, google = null, googleLoading = null;
  async function setPhotoreal(on) {
    photoreal = !!on;
    if (photoreal && !google) {
      googleLoading = googleLoading || Cesium.createGooglePhotorealistic3DTileset()
        .then(t => { google = t; scene.primitives.add(t); return t; })
        .catch(e => { console.warn('[sim] Google 3D tiles unavailable (add "Google Photorealistic 3D Tiles" to your ion account)', e); googleLoading = null; return null; });
      await googleLoading;
      if (!google) { photoreal = false; return false; }
    }
    if (google) google.show = photoreal;
    scene.globe.show = !photoreal;
    if (buildings) buildings.show = !photoreal && LEVELS[perf.level].buildings;
    return photoreal;
  }

  /** Resolves once the visible tiles have streamed in (or after maxMs). */
  function whenTilesLoaded(maxMs = 12000) {
    return new Promise(res => {
      const t0 = performance.now();
      const remove = scene.postRender.addEventListener(() => {
        if ((scene.globe.tilesLoaded && performance.now() - t0 > 500) || performance.now() - t0 > maxMs) { remove(); res(); }
      });
    });
  }

  // ---- Auto-perf: watch the real frame rate and walk the quality ladder ----
  const perf = { level: 0, fps: 60 };
  let frames = 0, t0 = performance.now(), lowFor = 0, highFor = 0;
  function applyLevel(i) {
    perf.level = i;
    const L = LEVELS[i];
    scene.globe.maximumScreenSpaceError = L.sse;
    viewer.resolutionScale = L.res;
    if (buildings && !photoreal) buildings.show = L.buildings;
    console.log(`[sim] quality level ${i} (sse ${L.sse}, res ${L.res}${L.buildings ? '' : ', no buildings'}) at ${perf.fps} fps`);
  }
  scene.postRender.addEventListener(() => {
    frames++;
    const now = performance.now(), span = now - t0;
    if (span < 1000) return;
    perf.fps = Math.round(frames * 1000 / span);
    frames = 0; t0 = now;
    if (!PERF.autoPerf || document.hidden) return;
    if (perf.fps < PERF.targetFps) { lowFor++; highFor = 0; } else if (perf.fps >= 58) { highFor++; lowFor = 0; } else { lowFor = highFor = 0; }
    if (lowFor >= 3 && perf.level < LEVELS.length - 1) { applyLevel(perf.level + 1); lowFor = 0; }
    else if (highFor >= 15 && perf.level > 0) { applyLevel(perf.level - 1); highFor = 0; }
  });
  viewer.perf = perf;

  viewer.setPhotoreal = setPhotoreal;
  viewer.whenTilesLoaded = whenTilesLoaded;
  return viewer;
}
