# Valkyrie: Master Checklist (status after the merge build)
- ✅ = built **and tested** here (unit tests + a headless-Chrome end-to-end run of seat, admin, tower and yoke)
- 🟡 = built, **verify on your laptop or phone** (needs real internet, a GPU, a phone or a mic)
- ⬜ = **you** need to do it (manual, or needs a person/permission)

> This machine had almost no internet, so the 3D world itself (Cesium terrain, imagery, buildings) could not be seen here. Everything else ran in a real browser.

---

## ⬜ Your to-do list (only the things code can't do)
1. **Google Photorealistic 3D (optional wow):** cesium.com/ion → Asset Depot → search "Google Photorealistic 3D Tiles" → **Add to my assets**. Then /admin → "Photoreal 3D". If FPS drops below ~30 (shown in /admin), switch it off.
2. **Record the tower lines (10 min):** open `/tower/` on a laptop or phone with a mic → "Record the tower lines" → ● Rec / ■ Stop for each line. Use a calm, clipped "ATC voice". Record them for the route you'll demo.
3. **Captain Vee art:** generate 2 PNGs with the prompt in `web/seat/img/README.txt` and save them as `captain-vee-wave.png` and `captain-vee-thumbs.png` in `web/seat/img/`.
4. **Ask the organisers** about using The Visa Guy logo (currently text only).
5. **On the real hardware:** go through every 🟡 below (map, phone tilt, QR scan, plane direction, FPS, mic).
6. **Warm the cache:** fly the demo route 2–3× in the same Chrome profile (watch "tiles cached" grow in /admin).
7. **Backup screen recording** of a perfect run (60–90 s).
8. **Booth + pitch** (§11).

## 0. Setup
- [ ] Node 20+, git, VS Code, Chrome, Claude Code
- [x] Cesium ion token in `web/shared/config.js`
- [ ] All devices on **one phone hotspot**
- [ ] `npm install` → `npm test` (**11 tests**) → `npm start`
- [ ] Laptop `/seat/`, phone `/yoke/`, second device `/admin/`, optional third `/tower/`
- [ ] Private GitHub repo pushed

## 1. The experience
- [x] ✅ Flight clock drives the phases; timeline bar; drop in/out; late passenger + practice takeoff; progress saved
- [x] ✅ Demo Mode (/admin): warp, jump, reset, route switch (end-to-end tested)

## 2. Real route and 3D world
- [ ] 🟡 Terrain + satellite imagery + OSM buildings (NaturalEarth globe underneath if ion is unreachable)
- [x] ✅ Featured routes CCJ→DXB / COK→DXB with real runway thresholds
- [x] ✅ Ground heights sampled at **both** runway ends (runway slope), **true** runway bearing from the two ends
- [ ] 🟡 Cruise view: route line, overview swoop, follows real progress at 11,000 m
- [ ] 🟡 Plane faces the right way (`MODEL_HEADING_OFFSET` in `sim/sim.js`)
- [x] ✅ **Any-airport picker** (seat intro "Change flight" + /admin). Runways picked from data; lines, cities and timeline follow
- [ ] 🟡 **Google Photorealistic 3D toggle** (/admin). Needs the ion asset (to-do #1)

## 3. Flying
- [x] ✅ Arcade model at 120 Hz, takeoff → 300 m → cruise, approach 8 km on 3°, grades, go-around respawn
- [x] ✅ Pilot Mode approach: autothrottle until you move the lever (no surprise full-power dives)
- [ ] 🟡 Chase / cockpit (V or HUD button) / orbit (certificate) cameras
- [ ] 🟡 Feel tuning on real hardware (`sim/flight.js` → `K`)

## 4. Kid Mode
- [x] ✅ All assists; lands BUTTER even 150 m off the centreline (`npm test`); rings in both modes

## 5. Phone yoke
- [x] ✅ Tilt, throttle, Brake, Kid, Ready, Centre, Retry, **FLY/AUTO** (take the controls), **CAMERA**
- [ ] 🟡 Tilt on your phone, in **both** grips (landscape wheel / portrait tray). Sensitivity: `GRIP` in `yoke/yoke.js`

## 6. Control tower
- [x] ✅ Route-aware lines (handoff centre computed from data: "Muscat Control" for CCJ→DXB), deviation calls, radio chain
- [x] ✅ **Live Control Station `/tower/`:** live flight status, push-to-talk voice to the seat (through the radio filter), typed messages, every clearance as a button, read-back log
- [x] ✅ **In-browser clip recorder** on `/tower/` (upload API tested); clips replace TTS automatically
- [ ] ⬜ Actually record the clips (to-do #2)
- [x] ✅ **Read-back:** after "cleared for takeoff/to land", 🎙️ "Read it back" → speech recognition checks it → "readback correct" + "Radio pro" badge (matching unit-tested)
- [ ] 🟡 Read-back on the laptop (Chrome; speech recognition needs internet; allow the mic)
- [ ] 🟡 Push-to-talk on the tower device (allow the mic)

## 7. Captain Vee + The Visa Guy
- [x] ✅ Intro, Kid Mode co-pilot bubbles, Where next with tagged QRs
- [x] ✅ QR renders (qrcodejs now **vendored**, no CDN needed)
- [ ] 🟡 Scan a QR with a phone and check the URL
- [ ] ⬜ Captain Vee PNGs (to-do #3) · ⬜ TVG logo permission (to-do #4)

## 8. Certificate + logbook
- [x] ✅ Certificate with stars, grade, fpm, km, badges, QR
- [x] ✅ Badges: Wheels up · Crossed the Arabian Sea (now from `landmarks.json`) · Ring master · Butter landing · **Radio pro** · **Steady hands**
- [x] ✅ **"What's below me"** cards during cruise (landmarks + nearest city for any route, with left/right side)
- [x] ✅ **Cruise mission:** take the controls → hold altitude for 20 s → "Steady hands"

## 9. Performance
- [x] ✅ Low-poly plane, shadows off, fog, screen-space error 4, resolution 0.9, fixed-step physics
- [ ] 🟡 Check FPS on the slowest laptop. **/admin shows live seat FPS**; knobs in `sim/world.js` → `PERF`

## 10. Internet / offline safety
- [x] ✅ Everything except the map works offline (tested: the seat falls back to a stub sim if Cesium can't load)
- [x] ✅ **Tile-caching service worker** (`seat/sw.js`) + NaturalEarth fallback globe
- [ ] 🟡 Verify: fly once online, then turn off the hotspot's internet and reload: the route should still show
- [ ] ⬜ Warm the cache (to-do #6) · ⬜ Backup recording (to-do #7)

## 11. Booth + pitch
- [ ] ⬜ Cardboard seatback frame, charger, sleep off, brightness and volume up
- [ ] ⬜ Phone on a lanyard, screen timeout off; admin on a second device; **tower on a third** (a teammate plays the controller)
- [ ] ⬜ Before each judge: Admin → Reset, Kid Mode ON, phone Centre
- [ ] ⬜ Printed TVG QR + repo QR on the table
- [ ] ⬜ 2-minute pitch ×3. Suggested beats:
  1. Hook: "a flight sim that knows which flight you're on"
  2. Timeline bar
  3. Takeoff, then the tower says "cleared for takeoff" → the judge **reads it back**
  4. Warp to cruise: **"Below you: Muscat"** card, then the Where next QR
  5. "Dubai Approach is calling!" Your teammate on /tower **talks live**: "Valkyrie 101, nice flying"
  6. Butter landing (photoreal Dubai if FPS allows) + certificate
  7. "Fly from anywhere": type the judge's home airport
  8. Business case: a new seatback channel for TVG
