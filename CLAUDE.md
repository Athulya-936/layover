# Valkyrie: rules for Claude Code
- Read `README.md`, then `docs/BUILD_SPEC.md` (architecture, contracts) and `docs/MASTER_CHECKLIST.md` (what's done and what's left) before changing anything. Extend the code; don't rewrite it.
- The A/B ownership split from BUILD_SPEC §4 is optional now (one team). Keep the *boundary*: the seat talks to the sim only through the `createSim` API (§5.4, plus the optional `setPhotoreal`), and the sim only emits the bus events in §5.3.
- `web/shared/*` (config, contracts, bus): only additive changes, and only with a reason. `contracts.js` lists the v2 additions.
- Plain HTML + native ES modules, no bundler, no React. Cesium 1.121 comes from the CDN; qrcodejs is vendored in `web/vendor/`.
- No hardcoded place names in UI or radio lines: take them from `data/airports.json` (see `audio/lines.js`) so custom routes work.
- 60 fps beats visuals. Keep the latency of the phone → seat input path low.
- After a change: run `npm test` and `npm start`, then check `/seat/` (or `/seat/sim/sandbox.html` for sim work). Commit small.
