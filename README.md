# Valkyrie: Fly Your Flight (Layover 2026)

A seatback in-flight experience. You fly your real route (Calicut or Kochi to Dubai, or **any two airports**) over real 3D terrain, with your phone as the yoke, a radio-filtered control tower you can **talk to live**, Kid Mode, a pilot certificate, and "Where next?" with The Visa Guy (QR tagged `utm_source=seatback`).

## Run it
```bash
npm install
npm start          # prints https://<ip>:8443/seat  /yoke  /admin  /tower
npm test           # physics, route builder, read-back matching (11 tests)
```
1. The Cesium ion token is in `web/shared/config.js` (free at cesium.com/ion → Access Tokens).
2. Put every device on **one phone hotspot**.
3. **Laptop:** open `https://<LAN-IP>:8443/seat/` (use the IP, not `localhost`, so the yoke QR points at the laptop). Accept the certificate warning, then press F11.
4. **Phone (yoke):** scan the QR on the gate screen (or open `/yoke/`), accept the warning, tap **Start**.
   - Hold it **sideways like a steering wheel**, or **upright like a tray**: both work.
   - Tilt to turn, tip the top toward you to climb. **Centre** recalibrates, and double-tapping the horizon inverts pitch.
5. **Second device:** `/admin/` for warp, jump to phase, **Reset for next judge**, any-route picker, and the Photoreal 3D switch.
6. **Third device (optional, best wow):** `/tower/`. Be the control tower: hold to talk (your voice plays in the seat through the radio filter), type messages, fire clearances, and record the official lines.

No phone? The seat flies with the keyboard (below), and on-screen arrows appear after 10 s.

| Key | Action |
|---|---|
| W / S (or ↑ / ↓) | pitch (S / ↓ = pull back = nose up) |
| A / D (or ← / →) | roll |
| Shift / Ctrl | throttle |
| B | brake |
| K | Kid Mode |
| V | cockpit / chase camera |
| T | take the controls / back to autopilot (cruise) |

Sim-only test page: `/seat/sim/sandbox.html`. Keys: 1 runway · 2 approach · C cruise · T/Y take/release control · V cockpit · Shift+V orbit · X chase.

## What's in it
| Area | Highlights |
|---|---|
| Whole flight | Server flight clock (mock aircraft feed) drives Intro → Gate → Takeoff → Cruise → "Approach is calling" → Approach → Landed → Certificate. Timeline bar, late-passenger practice takeoff, progress saved in the browser |
| 3D world | Cesium World Terrain + Bing imagery + OSM buildings, NaturalEarth fallback globe, ground heights sampled at both runway ends (runway slope), true runway bearings, optional **Google Photorealistic 3D** |
| Flying | Arcade model at 120 Hz, Kid Mode (auto-throttle, auto-rotate, glide path, centreline, autoflare, autobrake), 8 rings, landing grades, chase / cockpit / orbit cameras, take the controls during cruise, autothrottle on approach in Pilot Mode until you move the lever |
| Fly from anywhere | Seat intro → "Change flight", or /admin. The server picks real runways from `airports.json` (aligned with the route); the tower lines, cities, handoff centre and timeline all follow |
| Tower / radio | Route-aware ATC lines, band-pass radio chain, live **push-to-talk** from /tower, typed messages, in-browser **clip recorder** (replaces TTS), passenger **read-back** with speech recognition ("Radio pro" badge) |
| Cruise | Great-circle route line and overview swoop, **"what's below me"** cards (`data/landmarks.json` + nearest city for any route, with left/right side), altitude-hold mission ("Steady hands") |
| TVG | Where next (6 destinations, tagged QR), certificate QR. The QR library is vendored (`web/vendor/`), so it works offline |
| Offline safety | `seat/sw.js` caches the Cesium library, imagery, terrain and buildings after the first flight. /admin shows the cached-tile count and seat FPS |

## Tuning knobs
| What | Where |
|---|---|
| Frame rate | `sim/world.js` → `PERF` (`maximumScreenSpaceError` 4 → 8, `resolutionScale` 0.9 → 0.75) |
| Feel | `sim/flight.js` → `K` (THRUST, PITCH_RATE, ROLL_RATE…) |
| Kid assists | `sim/assist.js` |
| Plane model faces sideways | `sim/sim.js` → `MODEL_HEADING_OFFSET` (try 0 or 180); the wheel height is `MODEL_Z_OFFSET` |
| Phone sensitivity | `yoke/yoke.js` → `GRIP` (degrees of tilt for full deflection, per grip) |
| Tower lines | `seat/audio/lines.js`; record your own on `/tower/` (saved to `seat/audio/clips/<id>.webm`) |
| Landmarks | `data/landmarks.json` (`name, lat, lon, radiusKm, fact, emoji, badge?`) |
| Captain Vee art | `seat/img/captain-vee-wave.png`, `captain-vee-thumbs.png` (emoji until then; prompt in `seat/img/README.txt`) |
| Routes / QR link | `shared/config.js` |

Docs: `docs/BUILD_SPEC.md` (architecture and contracts), `docs/RUNBOOK.md` (setup and deploy), `docs/MASTER_CHECKLIST.md` (status and what's left).

## Credits
CesiumJS (Apache-2.0), including the sample model `Cesium_Air.glb` from the CesiumJS repo · Cesium World Terrain + Bing imagery via Cesium ion · Google Photorealistic 3D Tiles (optional, via Cesium ion) · OpenStreetMap buildings © OpenStreetMap contributors · Airport data: OurAirports (public domain) · QR: qrcodejs (MIT). Built at Layover 2026, TinkerSpace Calicut.
