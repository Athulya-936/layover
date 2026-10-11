# VALKYRIE: Runbook, from scratch to demo
Use this with `BUILD_SPEC.md`: the spec says *what* to build, and this file says *how to set up, run, test and deploy* it. Times are IST.

---

## Step 0. Prerequisites (both laptops, ~10 min, do it now)
| Need | Check | Install if missing |
|---|---|---|
| Node.js 18+ (20 LTS best) | `node -v` | nodejs.org → LTS installer |
| git | `git --version` | git-scm.com (Windows: "Git for Windows") |
| VS Code | — | code.visualstudio.com |
| Claude Code | `claude --version` | `npm install -g @anthropic-ai/claude-code`, then run `claude` in the project folder and log in. Or use the VS Code extension "Claude Code" |
| Chrome (laptop) | — | google.com/chrome. Cesium runs best in Chrome |
| GitHub account | — | Create a **private** repo `valkyrie` (B does this) |
| Cesium ion token | — | cesium.com/ion → sign up free → Access Tokens → copy the default token (A does this) |

**Phones:** one Android or iPhone as the yoke. Chrome on Android or Safari on iPhone.

---

## Step 1. Network (2 min)
1. Turn on **Person A's or B's phone hotspot**. Connect **both laptops** to it. Don't use the venue Wi-Fi: it usually blocks devices from talking to each other.
2. Find the laptop's IP (the one that will run the server):
   - Mac: `ipconfig getifaddr en0`
   - Windows: `ipconfig` → "IPv4 Address" under Wireless LAN (e.g. `192.168.43.120`)
   - Linux: `hostname -I`
3. **Windows only:** when Node first starts, a firewall popup appears. Tick **Private networks** and click Allow. If you missed it, go to Windows Security → Firewall → "Allow an app" → Node.js → Private.

---

## Step 2. Repo setup
> **Starter code exists now:** `valkyrie.zip` (next to this file) is the whole working codebase. Person B unzips it, adds the Cesium token in `web/shared/config.js`, then does the `npm install` → `git push` steps below. Skip the "paste the spec to scaffold" part. Then both of you use Claude Code to *extend* it, staying inside your own files.

**Person B (11:15):**
```bash
mkdir valkyrie && cd valkyrie
git init -b main
code .                        # opens VS Code
claude                        # in the VS Code terminal
```
In Claude Code: paste **all of BUILD_SPEC.md**, then the **"Person B paste"** prompt (§12). When it finishes:
```bash
# put the Cesium token from A into web/shared/config.js
mkdir -p web/data && cp ~/Downloads/airports.json web/data/
npm install
npm start                     # should print https://<IP>:8443/seat, /yoke, /admin
git add -A && git commit -m "Scaffold + frozen contracts v1"
git remote add origin https://github.com/<you>/valkyrie.git
git push -u origin main
git tag contracts-v1 && git push --tags
git checkout -b b/experience
```
Add your teammate under GitHub → repo → Settings → Collaborators.

**Person A (as soon as B has pushed):**
```bash
git clone https://github.com/<B>/valkyrie.git && cd valkyrie
git checkout -b a/sim
npm install
code . ; claude
```
In Claude Code: paste **all of BUILD_SPEC.md**, then the **"Person A paste"** prompt (§12).

**Your daily git loop (both):**
```bash
git add -A && git commit -m "short message" && git push -u origin HEAD
```
Commit every 20–30 minutes. Tell Claude Code too: *"commit after each working step"*.

---

## Step 3. Running it
On the server laptop:
```bash
npm start
```
| Device | Open | Notes |
|---|---|---|
| Laptop (seatback) | `https://<IP>:8443/seat` | Click **Advanced → Proceed** on the cert warning. Press F11 for full screen |
| Phone (yoke) | `https://<IP>:8443/yoke` | Android Chrome: **Advanced → Proceed**. iPhone Safari: **Show Details → visit this website**. Then tap **Start** and allow motion access |
| 2nd phone or laptop (admin) | `https://<IP>:8443/admin` | Demo controls |
| Person A solo testing | `https://localhost:8443/sim/sandbox.html` (path per spec: `/seat/sim/sandbox.html`) | Works without B's UI |

**Why HTTPS?** Phones only give tilt data to secure pages, so the server makes its own certificate (`selfsigned`). The one-time warning is expected.

**If the phone tilt doesn't work:**
1. Is the URL `https://`, not `http://`?
2. iPhone: did you tap the Start button, so the permission prompt appeared? Settings → Safari → "Motion & Orientation Access" must be on.
3. Is the phone on the same hotspot? Try opening `https://<IP>:8443/yoke` again.
4. **Fallback tunnel**, if certificates fight you (needs internet, adds a little lag): install `cloudflared`, run `cloudflared tunnel --url https://localhost:8443 --no-tls-verify`, and open the `https://….trycloudflare.com/yoke` URL it prints on the phone. It's a real certificate, so there's no warning.

---

## Step 4. Checkpoints: how to test each one
**CP1, 12:30 AM: "phone flies the plane"**
```bash
# B:
git checkout main && git pull
git merge origin/a/sim && git merge b/experience && git push
# A and B:
git checkout <your-branch> && git merge origin/main
```
Test: `/seat` shows the globe at Calicut runway 28. Tilt the phone, and the plane responds within a blink. Throttle up, and it takes off. ✅ Pass if a teammate can take off using only the phone.

**CP2, 2:00 AM: "full loop in Demo Mode"** (same merge commands)
Test on `/admin`:
1. Reset, then jump to TAKEOFF. You hear "cleared for takeoff" (radio sound), and the takeoff works.
2. Jump to DESCENT_CALL. You see "Dubai Approach is calling!" and get the approach at DXB 30L.
3. In Kid Mode, rings appear. Land, and you get a grade, a phone buzz and a "welcome to Dubai".

✅ Pass if all three work twice in a row.

**CP3, 3:15 AM: "feature complete"**
Test: grab someone from another team. With no help from you they should get through the intro (VISA APPROVED), see the timeline bar, take off, cruise with the Where next QR (scan it with a phone and check the URL contains `utm_source=seatback`), land, and get the certificate. Write down every confusing moment and fix those first.

**4:00 AM: freeze**
```bash
git checkout main && git pull && git tag demo-v1 && git push --tags
```
After this, only bug fixes, each one OK'd by the file's owner.

---

## Step 5. Deploy (two options; do A, and B is optional)
### Option A (recommended for judging): run locally on your laptop
This is the most reliable option: no cold starts and no venue Wi-Fi problems. This is your demo setup.

### Option B: a public link (nice for the README and for judges to try later)
**Render.com** (free, supports WebSockets, gives a real HTTPS certificate, so phones work with no warning):
1. B makes one small change in `server/index.js`: if `process.env.PORT` is set, start a plain **http** server on that port (Render adds HTTPS itself). Otherwise keep the selfsigned HTTPS on 8443.
2. render.com → New → **Web Service** → connect the GitHub repo:
   - Build command `npm install`
   - Start command `npm start`
   - Instance: Free
3. Open `https://valkyrie-xxxx.onrender.com/seat` and `/yoke`.

Notes:
- The free tier **sleeps after ~15 minutes idle** (the first load then takes ~50 s), so don't rely on it at the booth.
- Vercel and Netlify won't work for the server, because they don't run a long-lived WebSocket server.

---

## Step 6. Offline / internet safety (3:15–5:00 AM)
1. On the hotspot, open `/seat` and fly the **exact demo route 3 times**: CCJ takeoff, then cruise, then DXB approach and landing. The browser caches the map tiles.
2. Keep that same Chrome window and profile open. Don't use incognito, and don't clear the cache.
3. Test: turn the laptop's Wi-Fi **off** and run the demo again. Anything that looks blank shows you what isn't cached.
4. Make a **backup video** of a perfect run (Mac: Cmd+Shift+5. Windows: Win+Alt+R (Xbox Game Bar) or OBS).
5. Note how much data one run uses (DevTools → Network, bottom bar), so you don't burn the hotspot data.

---

## Step 7. Booth setup (6:00–7:00 AM)
- **Hardware:**
  - laptop on a chair back, at eye height, in a cardboard "seatback" frame with the Valkyrie and Captain Vee logo
  - charger plugged in
  - laptop sleep turned **off**, brightness at max
  - phone yoke on a lanyard with the yoke page open, screen timeout set to **never** (or 10 min)
  - a second device on `/admin`
- **Sound:** laptop speakers at full, or a small Bluetooth speaker. Test the radio voice in the noisy room.
- **Before every judge:**
  1. Admin → **Reset**, then Kid Mode **ON**.
  2. Seat is on the intro screen.
  3. Phone shows "Centre" calibrated.
- **Printed on the table:** the TVG "Where next?" QR (the same `utm_source=seatback` link) and a QR to your GitHub/README.
- **Laptop chargers, power bank for the phones, spare cable.**

---

## Step 8. "Submission" (no form is listed, so judging is the demo)
Have these ready anyway, because judges and The Visa Guy may ask:
1. **GitHub repo** (make it public after the freeze if you're happy to share) with a README covering:
   - a one-line pitch, plus screenshots/GIF
   - how to run (`npm install && npm start`)
   - the architecture diagram (copy §3 of BUILD_SPEC.md)
   - credits (CesiumJS, OpenStreetMap buildings, OurAirports data, the plane model's licence)
   - "built at Layover 2026"
2. **The backup video**, 60–90 s, uploaded as an unlisted YouTube video or to Google Drive.
3. **A 2-minute pitch**, rehearsed 3 times (script: §11 of BUILD_SPEC.md).
4. **The live link**, if you did the Render deploy.

---

## When something breaks
| Symptom | Fix |
|---|---|
| Globe is black or white, with a "token" error in the console | Wrong or missing Cesium token in `config.js` |
| Plane floats or sinks into the runway | Use `sampleTerrainMostDetailed` for ground height, not `elevFt` (§6) |
| Low FPS | Raise `maximumScreenSpaceError` to 8, set `resolutionScale` to 0.75, hide OSM buildings during cruise |
| Phone connects but nothing moves | Check that the seat page subscribes to `input` and that `sim.setInput` is called (main.js) |
| No sound | Click or tap once on the seat page first (browser audio unlock) |
| `EADDRINUSE 8443` | An old server is still running. Mac/Linux: `lsof -i :8443` then kill it. Windows: close the other terminal |
| Git conflict | Someone edited a file they don't own; the owner's version wins (`git checkout --theirs <file>` or `--ours`) |
| Claude Code goes off-spec | Tell it: "Re-read BUILD_SPEC.md §4 and §5. Only edit files I own." |

Stuck for more than 10 minutes on one bug? Apply the cut list (BUILD_SPEC §10) and move on. You can also paste the error in this thread.
