# VALKYRIE: Build Spec (Layover 2026)
> Seatback "Fly Your Flight" experience + The Visa Guy "Where next?" QR.
> Paste this whole file into Claude Code in each person's VS Code, then add the "Starter prompt" for your role (§12).
> **Rule #1: only edit files you own (§4). The contracts in §5 are frozen. Change them only after both people agree out loud.**

Times are IST. Start 11:15 PM · **feature-complete 3:15 AM** · **freeze 4:00 AM** · build ends 6:00 AM · judging 7:00 AM.

---

## 1. What we're building (one paragraph)
A **web app** that runs full-screen on a laptop mounted as a seatback screen. The passenger is on a real route (CCJ→DXB or COK→DXB). The experience follows the real flight's clock: an intro at the gate with Captain Vee and a "VISA APPROVED" stamp, then takeoff from the real runway, then cruise at the real position along the great-circle route (with autopilot when they leave), then "Dubai Approach is calling!" about 30 minutes before arrival, then landing at the real runway, then a landing grade and pilot certificate. During cruise and on the certificate, **"Where next?"** shows a QR code for **The Visa Guy** tagged `utm_source=seatback`, so TVG can book their visa for the next trip. A **phone is the yoke** (tilt to steer). Real terrain and 3D buildings come from **CesiumJS**. The tower talks over a **radio-filtered voice**. **Kid Mode** makes landing foolproof. A **Demo Mode** (time warp + jump to phase) shows the whole flight to judges in about 2 minutes.

## 2. Tech stack (no bundler, keep it boring)
| Piece | Choice |
|---|---|
| Server | Node 18+, `express`, `ws`, `selfsigned` (HTTPS cert generated at boot). One process, port 8443 |
| Frontend | Plain HTML + **native ES modules** (`<script type="module">`), no build step, no React |
| 3D globe | **CesiumJS 1.121 from CDN**: `https://cesium.com/downloads/cesiumjs/releases/1.121/Build/Cesium/Cesium.js` + `.../Widgets/widgets.css`. Free Cesium ion token |
| QR | qrcodejs from cdnjs: `https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js` |
| Audio | Web Audio API (bandpass radio chain) + `speechSynthesis` fallback |
| Phone sensors | `DeviceOrientationEvent` (needs HTTPS; on iOS call `requestPermission()` from a tap) |
| Network | **Everything on one phone hotspot.** Phone opens `https://<laptop-ip>:8443/yoke` and accepts the cert warning once |

## 3. Folder structure
```
valkyrie/
├── package.json                    B
├── .gitignore                      B   (node_modules, certs)
├── README.md                       B   (how to run, 5 lines)
├── server/
│   ├── index.js                    B   express + https + ws relay + static
│   └── clock.js                    B   mock aircraft feed: flight clock, warp, jump
└── web/
    ├── shared/                     ── FROZEN CONTRACTS (written at 11:15, both read, nobody edits alone)
    │   ├── contracts.js                constants, phases, message builders, JSDoc types
    │   ├── bus.js                      tiny event bus
    │   └── config.js                   token, QR base URL, callsign, featured routes
    ├── data/
    │   └── airports.json           B   copy of hackathon/airports.json (3,165 airports)
    ├── seat/
    │   ├── index.html              B   page shell, loads Cesium + main.js
    │   ├── main.js                 B   wiring: creates bus, net, sim, director, ui
    │   ├── net.js                  B   WebSocket client → bus
    │   ├── input.js                B   keyboard + on-screen touch fallback → bus 'input'
    │   ├── director.js             B   phase state machine driven by clock
    │   ├── styles.css              B
    │   ├── ui/
    │   │   ├── shell.js            B   IFE home tiles + flight card + timeline bar
    │   │   ├── intro.js            B   Captain Vee + passport stamp + boarding pass
    │   │   ├── hud.js              B   speed / alt / VS / heading / throttle / subtitles
    │   │   ├── notify.js           B   toasts ("Dubai Approach is calling!")
    │   │   ├── certificate.js      B   grade + logbook + QR
    │   │   └── wherenext.js        B   TVG destination cards + QR
    │   ├── audio/
    │   │   ├── radio.js            B   Web Audio radio chain, play clip or TTS
    │   │   ├── lines.js            B   ATC line table
    │   │   └── clips/*.mp3         B   optional recorded lines, same ids as lines.js
    │   ├── img/                    B   captain-vee-*.png, tvg logo (if allowed)
    │   └── sim/                    ── ALL Person A
    │       ├── sim.js              A   createSim(): the ONLY public entry point
    │       ├── world.js            A   Cesium viewer, terrain, OSM buildings, perf settings
    │       ├── frame.js            A   ENU ↔ lat/lon helpers, runway geometry
    │       ├── flight.js           A   arcade flight model (pure math, no Cesium)
    │       ├── assist.js           A   Kid Mode: autothrottle, limits, centreline, autoflare
    │       ├── rings.js            A   glide-path rings
    │       ├── cruise.js           A   great-circle follow, route line, camera pull-up
    │       ├── camera.js           A   chase / cockpit cameras
    │       ├── assets/plane.glb    A   free low-poly airliner, under 1 MB
    │       └── sandbox.html        A   A's solo test page (keyboard only, no B code)
    ├── yoke/
    │   ├── index.html              B   phone controller
    │   └── yoke.js                 B
    └── admin/
        └── index.html              B   demo controls: warp 1/60/600, jump to phase, reset
```

## 4. Ownership (this is how we avoid clashes)
**Person A, World & Flight:** owns `web/seat/sim/**`, which is everything that touches Cesium or physics. A never edits outside `web/seat/sim/`. A tests alone in `sandbox.html` until checkpoint 1.

**Person B, Experience, Comms & TVG:** owns everything else: server, yoke, admin, director, UI, audio, styles, data, package.json. B never edits inside `web/seat/sim/`.

**Shared `web/shared/*`:** B creates these at 11:15 **exactly as written in §5** and pushes to `main` before anyone branches. After that they're frozen. A change needs both people to agree, then B makes it in one small commit to `main` and both pull.

**Talking across the line:** B only calls the `sim` API in §5.4. A only *emits* the bus events in §5.3. If you need something from the other side, ask; don't edit their file.

## 5. Contracts (frozen at 11:15)

### 5.1 `web/shared/config.js`
```js
export const CONFIG = {
  CESIUM_TOKEN: 'PASTE_ION_TOKEN',          // cesium.com/ion → Access Tokens (keep the repo private)
  CALLSIGN: 'Valkyrie',                      // spoken as "Valkyrie one zero one"
  QR_BASE: 'https://visaguy.ae/',            // or the SourceTag demo page if that gets built
  QR_PARAMS: { utm_source: 'seatback', utm_medium: 'qr', utm_campaign: 'layover2026' }, // + utm_content=<dest>, ref=<flightNo>
  TOD_MIN_BEFORE_ARR: 30,                    // top-of-descent call
  ROUTES: [
    { id: 'CCJ-DXB', flightNo: 'VK101', from: 'CCJ', to: 'DXB', depRwy: '28', arrRwy: '30L', blockMin: 245 },
    { id: 'COK-DXB', flightNo: 'VK202', from: 'COK', to: 'DXB', depRwy: '27', arrRwy: '30L', blockMin: 250 },
  ],
  DEFAULT_ROUTE: 'CCJ-DXB',
};
```
Runway thresholds come from `data/airports.json` (`airport.runways[].ends[]` with `{id, lat, lon, hdg, elevFt}`). Checked values: CCJ 28 = 11.1344, 75.968201, hdg 281 · COK 27 = 10.1526, 76.417397, hdg 267.9 · DXB 30L = 25.23592, 55.394882, hdg 301.

### 5.2 `web/shared/contracts.js`
```js
export const PHASE = Object.freeze({
  INTRO: 'INTRO', GATE: 'GATE', TAKEOFF: 'TAKEOFF', CRUISE: 'CRUISE',
  DESCENT_CALL: 'DESCENT_CALL', APPROACH: 'APPROACH', LANDED: 'LANDED', CERTIFICATE: 'CERTIFICATE',
});

/** Control input, all normalised. Produced by yoke/keyboard/touch, consumed by sim.
 * @typedef {{pitch:number, roll:number, throttle:number, brake?:boolean, src:'yoke'|'keys'|'touch'}} Input
 *   pitch -1..1 (+ = nose up), roll -1..1 (+ = right wing down), throttle 0..1 */

/** Snapshot the sim emits ~20×/s. SI units inside; UI converts.
 * @typedef {{
 *   lat:number, lon:number, altM:number, aglM:number,
 *   speedMs:number, vsMs:number, headingDeg:number, pitchDeg:number, rollDeg:number,
 *   throttle:number, onGround:boolean, mode:'free'|'cruise',
 *   rwy?: {alongM:number, crossM:number}   // relative to active runway threshold
 * }} FlightState */

/** Touchdown result.
 * @typedef {{vsMs:number, crossM:number, alongM:number, grade:'BUTTER'|'FIRM'|'HARD'|'GO_AROUND', stars:0|1|2|3}} Touchdown */

/** Clock from the server's mock aircraft feed.
 * @typedef {{depMs:number, arrMs:number, nowMs:number, warp:number, progress:number, routeId:string}} Clock
 *   progress = (now - dep)/(arr - dep), may be <0 (at gate) or >1 */

// WebSocket envelope: JSON {t:<type>, ...payload}. Connect with wss://<host>/ws?role=seat|yoke|admin
export const MSG = Object.freeze({
  INPUT: 'input',   // yoke  → seat   {pitch, roll, throttle, brake}            ~30 Hz, latest wins
  BUTTON: 'button', // yoke  → seat   {id:'kid'|'ready'|'reset'}
  CLOCK: 'clock',   // server→ all    Clock                                       1 Hz + on change
  JUMP: 'jump',     // server→ seat   {phase}                                     from admin
  ADMIN: 'admin',   // admin → server {cmd:'warp', value} | {cmd:'jump', phase} | {cmd:'route', routeId} | {cmd:'reset'}
  HAPTIC: 'haptic', // seat  → yoke   {ms}                                        touchdown buzz
  STATUS: 'status', // seat  → admin  {phase, state:FlightState}                  2 Hz
});

export const UNITS = { KT: 1.94384, FT: 3.28084, FPM: 196.85 };
```

### 5.3 `web/shared/bus.js` and the bus events
```js
export function createBus() {
  const t = new EventTarget();
  return {
    on: (type, fn) => t.addEventListener(type, e => fn(e.detail)),
    emit: (type, detail) => t.dispatchEvent(new CustomEvent(type, { detail })),
  };
}
```
| Event | Emitted by | Payload | Consumed by |
|---|---|---|---|
| `input` | B (net.js, input.js) | `Input` | main.js → `sim.setInput()` |
| `clock` | B (net.js) | `Clock` | director, shell timeline |
| `phase` | B (director) | `{phase, prev}` | ui, audio, net (status) |
| `flight:state` | **A** | `FlightState` (~20 Hz) | hud, director, net |
| `flight:liftoff` | **A** | `{}` | director, audio |
| `flight:altitude` | **A** | `{aglM}` once each at 300 m and 1000 m AGL | director, audio |
| `flight:touchdown` | **A** | `Touchdown` | director, certificate, audio, net (haptic) |
| `flight:ring` | **A** | `{index, total}` | hud, notify |
| `flight:deviation` | **A** | `{kind:'HIGH'|'LOW'|'FAST'|'SLOW'|'OFF_CENTRE'}` max once per 8 s, approach only | audio |
| `world:ready` | **A** | `{}` after terrain + first airport loaded | director (end loading screen) |
| `atc` | B (director) | `{id, text}` | radio.js, hud subtitles |

### 5.4 Sim API (A implements in `sim/sim.js`, B calls from main.js/director.js)
```js
// sim.js
export async function createSim({ bus, containerId, config, airports }) {
  // creates the Cesium viewer in #containerId, emits 'world:ready'
  return {
    spawnOnRunway(iata, rwyId),                     // TAKEOFF: on threshold, aligned, throttle 0, mode 'free'
    startCruise(route, progress),                   // CRUISE: autopilot on great circle at 11,000 m, camera pulls up, route line drawn
    setCruiseProgress(progress),                    // 0..1, director calls every clock tick
    takeControl(on),                                // CRUISE only: hand-fly near the route; off → autopilot eases back
    spawnOnApproach(iata, rwyId, distM = 8000),     // APPROACH: 3° glide path, 75 m/s, gear down
    setKidMode(on),                                 // assists + rings
    setInput(input),                                // latest Input
    setCamera(kind),                                // 'chase' | 'cockpit' | 'orbit'
    pause(on),
    getState(),                                     // FlightState
  };
}
```
Nothing else crosses the line. B never touches `Cesium.*` directly, and A never touches the DOM outside the Cesium container.

## 6. Person A spec: World & Flight (`web/seat/sim/`)
**world.js**
- `Cesium.Ion.defaultAccessToken = config.CESIUM_TOKEN`
- `new Cesium.Viewer(id, {terrain: Cesium.Terrain.fromWorldTerrain(), animation:false, timeline:false, baseLayerPicker:false, geocoder:false, homeButton:false, sceneModePicker:false, navigationHelpButton:false, fullscreenButton:false, infoBox:false, selectionIndicator:false})`
- `scene.primitives.add(await Cesium.createOsmBuildingsAsync())`
- **Perf (60 fps is the priority):** `globe.maximumScreenSpaceError = 4`, shadows off, `scene.fog.enabled = true`, `viewer.resolutionScale = 0.9` (expose to tune), and `scene.debugShowFramesPerSecond = true` in the sandbox only.

**frame.js**
- `enuFrame(lat, lon, h)` = `Cesium.Transforms.eastNorthUpToFixedFrame`
- `localToWorld(frame, x, y, z)`
- runway helpers: `alongCross(x, y, hdgDeg)` → `{alongM, crossM}`
- **Ground height:** `sampleTerrainMostDetailed(terrainProvider, [Cartographic.fromDegrees(lon, lat)])` at each threshold. **Don't use `elevFt`**, because Cesium heights are ellipsoidal and differ by tens of metres around India.

**flight.js** (pure function, unit-testable): `step(s, input, dt, assist)`. The frame origin is the active runway threshold; x = east, y = north, z = up (m above the threshold ground).
```
g=9.81  THRUST=3.2  DRAG=0.00018  V_ROTATE=70  V_STALL=55
PITCH_RATE=0.6 rad/s  ROLL_RATE=1.0 rad/s  MAX_PITCH=20°  MAX_ROLL=35°  (Kid: 10° / 25°)
speed   += (throttle*THRUST - DRAG*speed² - g*sin(pitch) - (onGround&&brake ? 3 : 0)) * dt
pitch   += input.pitch*PITCH_RATE*dt   (clamped; on ground pitch ≤ 0 until speed ≥ V_ROTATE)
roll    += input.roll*ROLL_RATE*dt     (clamped; self-levels 0.5 rad/s when input ≈ 0; 0 on ground)
heading += g*tan(roll)/max(speed,30) * dt
vs       = speed*sin(pitch) - (speed < V_STALL ? (V_STALL-speed)*0.6 : 0)
x += speed*cos(pitch)*sin(heading)*dt ;  y += speed*cos(pitch)*cos(heading)*dt ;  z += vs*dt
z ≤ 0 & airborne → touchdown → emit Touchdown, onGround = true, z = 0
```
- Use a fixed 1/120 s physics step with an accumulator, separate from rendering.
- **Grade:**
  - |vs| < 1.5 → BUTTER (3★)
  - < 3 → FIRM (2★)
  - < 5 → HARD (1★)
  - otherwise, or |crossM| > 30, or alongM < 0 → GO_AROUND (0★), then respawn on approach after 3 s
  - Never show "crash".

**assist.js (Kid Mode):**
- autothrottle (85 m/s climb, 75 m/s approach)
- Kid limits
- centreline assist: `roll += -k*crossM`
- glide-path assist toward 3°
- autoflare below 15 m AGL: target vs = −1.0 m/s
- auto-brake after touchdown

Pilot Mode: no assists, but keep the limits.

**rings.js:** 8 torus/ellipse entities on the 3° path from 8 km to 600 m before the threshold, about 25 m radius, emitting `flight:ring` when passed within 30 m. Show them in Kid Mode only.

**cruise.js:**
- `Cesium.EllipsoidGeodesic(fromCarto, toCarto).interpolateUsingFraction(progress)` for position.
- Heading from points ±0.001 apart.
- Altitude 11,000 m.
- Route polyline `{arcType: GEODESIC, width: 3}`.
- On `startCruise`, the camera flies up to an orbit view about 1,500 km up, then settles on a chase view.
- `takeControl(true)` runs `flight.js` in a local frame centred on the current route point. On release, ease heading and altitude back over 10 s.

**camera.js:** chase via `camera.lookAt(pos, new HeadingPitchRange(hdg, -0.15, 80))` (smoothed). Cockpit is about 2 m ahead of the nose. Release with `lookAtTransform(Matrix4.IDENTITY)` when switching.

**Plane:** a free low-poly airliner `.glb` (search "low poly airplane glb CC0") as an entity with `position` and `orientation` updated each frame via `Transforms.headingPitchRollQuaternion` (heading − 90° if the model faces +x). Fallback: `Cesium.Color` box primitives.

**sandbox.html:** loads Cesium + `sim.js` with a dummy bus and keyboard input:
- W/S = pitch
- A/D = roll
- Shift/Ctrl = throttle
- B = brake
- 1 = spawnOnRunway CCJ 28
- 2 = spawnOnApproach DXB 30L
- K = kid toggle
- C = cruise at 0.5

## 7. Person B spec: Experience, Comms & TVG
**server/index.js**
- `selfsigned.generate()` once and cache it to `certs/`.
- `https.createServer` + `express.static('web')`.
- `ws` on `/ws`, with role from the query.
- Relay `input`/`button` yoke→seat, `status` seat→admin, `haptic` seat→yoke, and `admin` → clock.js.
- Print `https://<LAN-IP>:8443/seat`, `/yoke` and `/admin` on start.
- The seat keeps only the **latest** input (no queue).

**server/clock.js**
- Starts with `depMs = now + 2 min` and `arrMs = depMs + blockMin`.
- Warp works by advancing a virtual `nowMs += realDt*warp`.
- `jump(phase)` sets virtual now:
  - GATE = dep − 1 min
  - TAKEOFF = dep
  - CRUISE = 40%
  - DESCENT_CALL = arr − 30 min
  - APPROACH = arr − 8 min
- Broadcast `clock` at 1 Hz and on any change.

**director.js** (the brain). Phases and transitions:
```
INTRO        → GATE          intro finished/skipped
GATE         → TAKEOFF       clock.progress ≥ 0 AND passenger tapped "Ready" (or admin jump)   → sim.spawnOnRunway
TAKEOFF      → CRUISE        flight:altitude 300 m AGL                                          → sim.startCruise
CRUISE       → DESCENT_CALL  now ≥ arr − TOD_MIN                                                → notify + ATC
DESCENT_CALL → APPROACH      passenger taps "Take the approach" (auto after 60 s real time)     → sim.spawnOnApproach
APPROACH     → LANDED        flight:touchdown with grade ≠ GO_AROUND
LANDED       → CERTIFICATE   after 4 s
```
- Missed takeoff (passenger arrived during cruise): GATE → CRUISE directly, offering a "Practice takeoff" button.
- Persist `{routeId, phase, stars, badges, kid}` to `localStorage` under key `valkyrie:<routeId>`, wrapped in try/catch, and resume on reload.
- Badges (simple): "Wheels up", "Crossed the Arabian Sea" (progress ≥ 0.5), "Ring master" (all rings), "Butter landing".

**ui/**
- **shell:** IFE home with tiles Movies/Music (disabled, "demo"), Live Map, ✈ Fly This Flight, and Where Next. Show the flight card (`VK101 · Calicut → Dubai`) and a **timeline bar** gate → takeoff → cruise → TOD → land with a moving marker. The bar is what proves "whole flight".
- **intro:** Captain Vee PNG waves, a passport slides in, a **VISA APPROVED** stamp (CSS scale + shake), and it flips into a boarding pass with the route. Skippable after 1 s, about 10 s total. Footer "Powered by The Visa Guy". Ask the organisers before using their logo.
- **hud:** knots, feet, fpm, heading, throttle bar, phase, Kid Mode badge, and the ATC subtitle line.
- **notify:** toasts plus Captain Vee speech bubbles in Kid Mode ("Fly through the rings!").
- **certificate:** stars, grade, route, km flown, badges, date, and the TVG QR ("Where next? Get your visa sorted").
- **wherenext:**
  - 6 destination cards (London, Paris, Tokyo, New York, Istanbul, Singapore) with photo/emoji. Say **"Check your visa with The Visa Guy"**, not a visa rule; don't state visa rules as fact.
  - Tap a card for a big QR code to `QR_BASE?utm_source=seatback&utm_medium=qr&utm_campaign=layover2026&utm_content=<city>&ref=<flightNo>`.
  - Available as a tile during CRUISE and on the certificate.

**audio/radio.js**
- Chain: `source → BiquadFilter('bandpass', 1500 Hz, Q 0.7) → WaveShaper (light curve) → Gain`.
- A squelch click plus a 120 ms filtered-noise burst before and after each line.
- `say(id)`: if `clips/<id>.mp3` exists, play it through the chain; else `speechSynthesis` (rate 1.05, unfiltered) with the noise bursts around it.
- Unlock the AudioContext on the first tap (the intro "Start" button).

**audio/lines.js** (`{CS}` = callsign + flight digits, e.g. "Valkyrie one zero one"):

| id | trigger | text |
|---|---|---|
| `gate` | GATE | "{CS}, {DEP} Tower, runway {DEPRWY}, line up and wait." |
| `takeoff` | TAKEOFF + throttle > 0.5 | "{CS}, wind calm, runway {DEPRWY}, cleared for takeoff." |
| `departure` | 1000 m AGL | "{CS}, contact departure. Good flight." |
| `handoff` | cruise progress 0.5 | "{CS}, Muscat Control, radar contact, maintain flight level 360." |
| `tod` | DESCENT_CALL | "{CS}, Dubai Approach, descend to 3000 feet, cleared ILS runway {ARRRWY}." |
| `land` | APPROACH start | "{CS}, runway {ARRRWY}, wind calm, cleared to land." |
| `high` / `low` / `fast` / `centre` | `flight:deviation` | "{CS}, you're high on the glide path." etc. |
| `welcome` | LANDED | "{CS}, welcome to Dubai. Taxi to the gate." |

**yoke/** (phone)
- A big "Tap to start" button requests the iOS permission and fullscreen and locks to landscape if possible.
- `deviceorientation` maps to pitch and roll (landscape: roll from `beta`, pitch from `gamma`). Calibrate the neutral position on "Centre", use a deadzone of 0.05, and expo curve x³·0.5 + x·0.5.
- A vertical throttle slider plus Brake, Kid and Ready buttons.
- Send `input` at 30 Hz.
- `navigator.vibrate(ms)` on `haptic`.

**admin/index.html:** route select, warp buttons 1× / 60× / 600×, jump buttons per phase, reset, and the live status line. Use it from the second phone or laptop during judging.

**input.js** (keyboard/touch fallback, same keys as the sandbox): on-screen arrows plus a throttle slider appear if no yoke has connected within 10 s.

## 8. Git workflow
- **11:15 – B:** `git init`, scaffold §3 with empty files, write §5 contracts **verbatim**, add `package.json` (`express ws selfsigned`) and `npm start` = `node server/index.js`. Push to `main` and tag it `contracts-v1`.
- **11:20 – A:** `git clone`, `git checkout -b a/sim`. **B:** `git checkout -b b/experience`.
- **Commit small and often** on your own branch. Since nobody edits the other's files, merges are conflict-free.
- **At each checkpoint (§9):** both commit and push, then B runs `git checkout main && git merge a/sim b/experience && git push`. Both then `git merge main` into their branch.
- If a merge conflicts, someone edited a file they don't own. The owner's version wins.
- Contract change: talk, then B edits `web/shared/*` on `main`, then both `git merge main`.
- **4:00 freeze:** only bug fixes after this, committed straight to `main` with the file owner's approval, plus tag `demo-v1`.

## 9. Timeline and integration checkpoints
| Time | Person A | Person B |
|---|---|---|
| 11:15–11:30 | Cesium ion token, clone, sandbox page loads the globe | Scaffold + contracts → `main`, server boots on HTTPS |
| 11:30–12:30 | world.js + frame.js + plane at CCJ 28, flight.js with keyboard: **takes off** | WS relay, yoke page (**test on the real phone over the hotspot**), net.js, input.js, clock.js |
| **12:30 CP1** | **Merge. Phone tilt flies the plane at CCJ in `/seat`.** | |
| 12:30–2:00 | Touchdown + grade, spawnOnApproach DXB 30L, Kid Mode assists + rings, deviation events | director.js, shell + timeline bar, HUD, radio.js + lines.js (TTS first), admin page |
| **2:00 CP2** | **Merge. In Demo Mode: gate → takeoff → (jump) → approach → landing → grade, with tower voice.** | |
| 2:00–3:15 | cruise.js (route line, camera pull-up, progress follow, takeControl), perf pass on the weaker laptop | intro (Captain Vee AI art), certificate, **Where next + TVG QR**, badges, localStorage resume |
| **3:15 CP3** | **Merge. Feature-complete run-through by someone outside the team.** | |
| 3:15–4:00 | Bug fixes, fly the route 3× to cache tiles | Bug fixes, record radio clips (optional), cardboard seatback |
| **4:00** | **FREEZE.** Tag `demo-v1` | |
| 4:00–6:00 | Backup screen recording of a perfect run, airplane-mode test | 2-minute pitch rehearsal ×3, booth setup |

## 10. Cut list (cut in this order if a checkpoint slips)
1. `takeControl` during cruise (autopilot-only cruise is fine)
2. localStorage resume and badges (keep stars)
3. Cockpit camera (chase only)
4. Recorded clips (TTS + noise bursts only)
5. Intro animation (keep a static Captain Vee + stamp image)
6. Cruise route line/camera pull-up (jump straight from takeoff to approach with a "4 hours later…" card)

**Never cut:** phone yoke · takeoff + landing at real airports · Kid Mode · tower voice · timeline bar + Demo Mode jump · **Where next TVG QR**.

## 11. Demo script (2 minutes at the booth)
1. The judge sits at the seatback and sees the intro: Captain Vee, **VISA APPROVED**, then the boarding pass for Calicut → Dubai.
2. Point at the timeline bar: "This runs for your entire 4-hour flight, synced to the aircraft."
3. They scan the yoke QR and hear Kid Mode plus "Calicut Tower, cleared for takeoff". They take off over real Calicut.
4. Admin jumps to cruise: the route arcs over the Arabian Sea. Open the Where next tile: "Tokyo next? Scan to check your visa with The Visa Guy." The QR is tagged `seatback`, so TVG sees it as a new channel.
5. Admin jumps to DESCENT_CALL: "Dubai Approach is calling!" The judge flies the rings and gets a Butter landing, a phone buzz, and the certificate with the QR.

## 12. Starter prompts for Claude Code
**Person A paste:**
> I am Person A in BUILD_SPEC.md. I own only `web/seat/sim/**`. Do not create or edit files outside that folder, and do not modify `web/shared/*`. Build `sandbox.html`, `world.js`, `frame.js`, `flight.js` and `sim.js` per §5.4 and §6 so that I can take off from CCJ runway 28 with the keyboard in the sandbox. Use CesiumJS 1.121 from the CDN, native ES modules, no bundler. Emit only the bus events listed in §5.3.

**Person B paste:**
> I am Person B in BUILD_SPEC.md. I own everything except `web/seat/sim/**`; never edit that folder. First scaffold the folders in §3 and write `web/shared/config.js`, `contracts.js` and `bus.js` exactly as in §5, plus `package.json` and `server/index.js` (HTTPS via selfsigned, ws relay on /ws, static web/). Then build `yoke/` and `net.js` so that phone tilt arrives on the seat page as bus `input` events. Call the sim only through the API in §5.4; until A's code is merged, stub it in `main.js` with a fake sim that logs calls.

**Run:** `npm install && npm start`. Open `https://<laptop-ip>:8443/seat` on the laptop (F11 for full screen), `/yoke` on the phone, and `/admin` on the second device. Everything goes over the phone hotspot.
