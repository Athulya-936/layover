// Cesium viewer with real terrain + OSM 3D buildings, tuned for frame rate. Owner: Person A.
// Layers, bottom to top:
//   NaturalEarthII (ships inside Cesium, works with no ion access) → Bing satellite via ion → OSM buildings.
// Optional: Google Photorealistic 3D Tiles (setPhotoreal), which replaces globe + buildings while on.
export const PERF = {
  maximumScreenSpaceError: 4,   // raise to 8 on weak laptops
  resolutionScale: 0.9,         // 0.75 on weak laptops
};

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
  scene.globe.depthTestAgainstTerrain = true;
  scene.highDynamicRange = false;
  viewer.resolutionScale = PERF.resolutionScale;
  scene.postProcessStages.fxaa.enabled = false;
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
    if (buildings) buildings.show = !photoreal;
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

  viewer.setPhotoreal = setPhotoreal;
  viewer.whenTilesLoaded = whenTilesLoaded;
  return viewer;
}
