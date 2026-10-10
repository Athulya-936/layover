# VALKYRIE — Fly Your Flight (Layover 2026)
1. `npm install && npm start` (Node 18+). Put your Cesium ion token in `web/shared/config.js`.
2. Laptop: open `https://<laptop-ip>:8443/seat/` (accept the cert warning, F11 for full screen).
3. Phone (same hotspot): open `https://<laptop-ip>:8443/yoke/`, accept the cert, tap Start.
4. Second device: `https://<laptop-ip>:8443/admin/` for warp / jump-to-phase / reset.
5. Spec: see BUILD_SPEC.md. Person A owns `web/seat/sim/**`, Person B owns everything else.
