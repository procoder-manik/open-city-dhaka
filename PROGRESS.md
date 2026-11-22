# PROGRESS — read this first

> **For any AI or developer picking up this project:** this file is the single source of truth for *where the work stopped*.
> 1. Read this file fully, then `AGENTS.md`, then the docs it points to.
> 2. Continue from **"▶ NEXT STEP"** below. Don't redo finished work.
> 3. Before you stop (or when your limit is close), **update this file** (Status, Done, Next Step, Session Log), then commit and push to GitHub.

---

## Status snapshot
| Field | Value |
|---|---|
| Last updated | 2026-11-21 |
| Updated by | Claude (Opus 5.5) |
| Current phase | **LIVE: https://open-city-dhaka-swg5.vercel.app (Vercel + Neon Singapore). Acts 1–3 (15 missions), P0–P6 done, P7 ~90 %, P8 ~85 %** |
| Overall progress | P0–P6 100 % · P1.5-B ~35 % (realistic models need owner downloads) · P7 ~90 % (rain + wet grip, load-shedding, HUD editor, haptics, auto-fire, battery saver, saved settings, culling done; real-phone perf test, radio, in-game phone, outfits left) · P8 ~70 % (ready to deploy; needs owner's Neon + Vercel) |
| Game name | Working title **GTM: Great Thief Mostofa** ("Bangladesh's Most Wanted"), set in `brand.config.json`, changeable anytime (`docs/09-BRANDING.md`) |
| GitHub repo | https://github.com/procoder-manik/open-city-dhaka (branch `main`) |
| Database | **PostgreSQL 18 on Neon** (ap-southeast-1, pooled) via `DATABASE_URL` — live since 2026-11-22; embedded PGlite in `.data/` when unset (dev). Check: `pnpm db:check`, live: `pnpm --filter @game/web db:roundtrip <url>` |
| Build status | `pnpm typecheck`, `lint`, `test` (70 unit), `build`, `e2e` (19 Playwright, desktop + phone) all pass locally (2026-11-21). CI run on GitHub not yet checked |

## How to run
```bash
pnpm install
pnpm dev            # http://localhost:3000  (game at /play, ?debug=1 → window.__game + FPS overlay)
pnpm build && pnpm start
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @game/web exec playwright install chromium   # once
pnpm build && pnpm e2e
# manual checks with screenshots (server on :3100): node apps/web/e2e/phase1-check.mjs <outDir> [tier]
#                                                   node apps/web/e2e/drive-check.mjs <outDir>
#                                                   node apps/web/e2e/life-check.mjs <outDir> [tier]
#   city-check / traffic-check / combat-check / busted-check / mission-check / weather-check / act2-check .mjs (same usage)
#   act2-play.mjs / act3-play.mjs: full Act 2 / Act 3 play-throughs (every mission start → pass, real mechanics); exit 1 on any failure
#   polish-check.mjs: wet braking, spray, blackout, haptics, touch auto-fire, battery saver
#   station-check.mjs: low fuel, petrol pump (pay per litre, broke), garage repair + respray
pnpm assets:icons   # regenerate PNG icons + share card after changing brand logos
```
Deploy: see `docs/12-DEPLOY.md` (Vercel + Neon, env vars in `apps/web/.env.example`).

## Phase tracker
Legend: ⬜ not started · 🟨 in progress · ✅ done · ⏸ blocked

| Phase | Name | Status | Notes |
|---|---|---|---|
| — | Planning docs | ✅ | `docs/01`–`09` |
| P0 | Foundation (monorepo, Next.js, engine boot, Game Lock, PWA, CI) | ✅ | See "Phase 0 result" below |
| P1 | "Feel" vertical slice (character, camera, 3 vehicles, one street, touch controls) | ✅ | See "Phase 1 result"; real-phone test pending |
| P1.5 | Life, sound & realism upgrade (owner feedback) | 🟨 | Part A done; Part B needs assets/voice decision (`docs/11-ART-REALISM.md`) |
| P2 | Mohammadpur map (OSM pipeline, streaming, landmarks) | ✅ | Real OSM map (18k buildings) streamed in 256 m chunks around the hand-built Tajmahal Road block; minimap + full map. Hand-made landmark models still TODO |
| P3 | Vehicles & city life (traffic, peds, carjacking) | ✅ | Road graph from OSM, instanced traffic (car/CNG/bus/rickshaw/bike), pedestrians, carjacking |
| P4 | Combat, weapons & police (Thana Alert) | ✅ | Fists, pistol, grenades, health, police foot + patrol cars, wasted/busted |
| P5 | Missions & story Act 1 | ✅ | Mission framework + 5 Act 1 missions (`gameplay/act1.ts`) |
| P6 | Backend, accounts, cloud saves, leaderboards | ✅ | Login (email + optional Google), account page (change password, delete), hero name, cloud save, leaderboard |
| P7 | Polish (audio, weather, phone, HUD editor, perf) | 🟨 | Legal pages, PNG icons, SEO, monsoon rain + thunder, touch HUD editor, off-screen actor culling done; real-phone perf test left |
| P8 | Launch | 🟨 | Ready: deploy guide, env template, robots/sitemap/OG. Owner: create Neon DB + Vercel project |
| P9+ | Expansion (Dhaka areas, Cox's Bazar, multiplayer) | ⬜ | |

## ✅ Done so far
- [x] Planning docs 01–09, handoff system (this file, `AGENTS.md`, `CLAUDE.md`), brand presets
- [x] **Phase 0 — Foundation**
  - [x] pnpm + Turborepo monorepo: `apps/web`, `packages/engine`, `packages/shared`, `packages/content`, `tools/asset-pipeline`, `tools/map-builder` (README only)
  - [x] `packages/shared/src/brand.ts`: reads the active preset from `brand.config.json`, zod-validated, `brandText()` placeholders
  - [x] `packages/content/src/presets.json`: quality presets Lite/Mobile/Medium/High/Ultra (zod-validated)
  - [x] Engine (`packages/engine/src`): `Game.ts` (createGame), `core/FixedStepLoop`, `render/createRenderer` (three.js WebGPURenderer, WebGL2 fallback), `input/InputManager` (keyboard/mouse + touch + gamepad → actions, taps never lost), `platform/device|quality|DynamicResolution`, `gamelock/GameLock`, `physics/*` (Rapier in a Web Worker, inline fallback), `scenes/TestScene` (replaced in Phase 1 by `SliceScene`), `state/store` (zustand)
  - [x] Next.js 16 app (`apps/web`): landing `/`, `/play` (start screen, quality select, loading, HUD stats, pause menu, touch joystick/look/buttons, rotate-phone hint), `/api/health`, PWA manifest + `public/sw.js`, security headers + CSP (prod), site-wide COOP/COEP
  - [x] Physics worker entry is app-owned: `apps/web/workers/physics.worker.ts` → `@game/engine/physics-worker`
  - [x] Asset pipeline: `tools/asset-pipeline/optimize.mjs` (Meshopt), `check-budget.mjs` + `budgets.json` (`pnpm budget`)
  - [x] ESLint, Prettier, Vitest (18 tests), Playwright smoke (desktop + phone), GitHub Actions CI (`.github/workflows/ci.yml`)
  - [x] Verified in headless Chromium: boots in ~0.8 s, physics in worker, service worker active, cross-origin isolated, keyboard + joystick movement, Esc pause

- [x] **Phase 1 — "Feel" vertical slice**
  - [x] Hero **Mostofa** (`actors/Humanoid.ts`): procedural rig (no downloaded assets) — checked lungi, shirt, mustache, sandals; distance-driven walk/run gait (no foot sliding), idle breathing, jump/fall/land with impact, lean into turns & acceleration, motorbike riding pose
  - [x] Camera (`camera/CameraRig.ts`, `camera/raycast.ts`): over-the-shoulder, never clips into walls (ray vs static boxes), sprint FOV kick, landing/crash shake, auto-swings behind vehicles, speed FOV
  - [x] Vehicles: data in `packages/content/src/vehicles.json` (car, CNG, 150cc bike; schema `shared/src/vehicles.ts`); Rapier ray-cast vehicle controller in the physics worker (suspension, steering, handbrake drift, low centre of mass, bike kept upright + visual lean); `vehicles/controls.ts` (throttle → brake → reverse, speed-sensitive smoothed steering); `vehicles/VehicleVisual.ts` procedural models with wheels following suspension/steer/spin
  - [x] Get in/out with F / gamepad Y / touch "উঠো-নামো" button; Mostofa visible riding the bike; steps out on the footpath side
  - [x] Tajmahal Road block (`world/StreetBlock.ts`, `world/textures.ts`, `world/MeshBuilder.ts`): divided road with median plants, footpaths, zebra crossing, 4–10 storey buildings with grilled windows, Bangla shop signboards (32 in one atlas), shutters/open shops, awnings, balconies with laundry, AC units, rooftop water tanks, rebar, background skyline, electric poles with sagging tangled wires, tea stall, parked rickshaw, two side galis, football. Merged meshes → Lite ≈ 60 draw calls
  - [x] Lighting (`world/Environment.ts`): gradient sky dome, sun with shadows following the player, golden-hour start (5:10 PM), full day–night (24 h = 48 min), night: lit windows, glowing signs, lamp light pools; bloom on Medium+ (`RenderPipeline` + BloomNode)
  - [x] HUD: clock, speedometer, enter/exit prompt, touch driving layout (joystick steer, ▲ gas, ▼ brake/reverse, HB handbrake); pause menu with runtime graphics switch, controls help, FPS toggle
  - [x] Debug hooks (`?debug=1`): `__game.debugInfo()`, `setHour(h)`, `debugEnterVehicle(id)`
  - [x] Tuned & measured (Lite, headless): car 0→88 km/h in 5 s, bike 0→90 km/h in 5 s, CNG 0→30 km/h in 2 s; braking ≈ 0.95 g (car 49 km/h → 0 in 8.5 m)

- [x] **Phase 1.5 Part A — life, sound, talk, damage** (owner feedback 2026-11-21)
  - [x] Docs: PRD (PL-8..10, VH-4/8..11, CB-8, WD-8..11, MS-7/8), `docs/10-AUDIO-DIALOGUE.md`, `docs/11-ART-REALISM.md`, GDD §9, roadmap Phase 1.5
  - [x] Hero redesign (`actors/Humanoid.ts`): smart young mastan — open red shirt over black tee, jeans, white sneakers, aviators, gold chain, stubble + mustache, quiff; swagger walk; real-world speeds (walk 1.6 / jog 3.6 / sprint 7.2 m/s); expressive face (blink, brows, smile, mouth flaps while talking, 6 emotions); idle gestures while talking
  - [x] Characters are **one skinned mesh** each (parts rigidly bound to bones, vertex colours) → ~1–2 draw calls per character
  - [x] NPCs (`actors/Npc.ts`): Mofiz Chacha (tea stall), rickshaw-wala, shopkeeper, foreign tourist (English); face the player, idle calls, react when bumped/honked/near-missed
  - [x] Dialogue (`dialogue/DialogueSystem.ts`, data `content/src/dialogue.json`, schema `shared/src/dialogue.ts`): 60 original funny Dhakaiya lines, anti-repeat, conversations, GTA-style subtitles with English meaning, emotions → face, `audio` slot per line for recorded voices
  - [x] Talk menu: greet / threaten / snatch / order / grab (number keys 1–5 or buttons); money ৳, notoriety 😈, public love ❤️
  - [x] Sound (`audio/AudioEngine.ts`, Web Audio, no files): engine per vehicle (car, bike, CNG two-stroke) following gears/speed, horns (H / LB / 📯), tyre skid, crash + glass, footsteps, city hum + distant horns, coin sound; mute in pause menu
  - [x] Posters & banners (`world/posters.ts`): 16 original funny posters on shutters and poles, banner across the road (fictional neta)
  - [x] Vehicle condition (`vehicles/condition.ts`): fuel use, per-zone damage from crashes, engine power loss, engine dead at 100%/empty tank; dashboard with speed, fuel, damage % and car zone diagram
  - [x] Particles (`world/Particles.ts`, 1 draw call): tyre dust, exhaust puffs, grey/black damage smoke, crash debris
  - [x] Draw calls after optimisation: Lite ≈ 81, Mobile ≈ 135, Medium ≈ 148

- [x] **Phase 1.5 Part B (free route) — started**
  - [x] Owner chose **free assets + AI voice**
  - [x] CC0 Poly Haven textures (asphalt, plaster, concrete, brick paving, rusted shutter, tin) → road, footpaths, walls, awnings, poles; 1024/512 px + normal maps (`tools/asset-pipeline/fetch-textures.mjs`, `pnpm assets:textures`)
  - [x] Device AI voice (`audio/VoicePlayer.ts`): built-in Bangla TTS per character (speed/pitch), tourist in English; pause-menu voice selector
  - [x] `pnpm voice:gen` (`tools/voice-gen/generate.mjs`): Azure neural voices (bn-BD) for all lines → MP3 + manifest; free tier

- [x] **Hero identity, Wanted & reputation** (owner request)
  - [x] `shared/src/identity.ts`: default **গ্রেট থিফ মোস্তফা**, preset titles (রংবাজ, গ্যাংস্টার, ডন…), name/title validation (length, links, abuse, real public figures), `{hero}` / `{heroName}` placeholders
  - [x] Pause menu `HeroPanel`: change title/name — **only for signed-in players** (login arrives in Phase 6; `?debug=1` unlocks for testing); guests see the default
  - [x] Subtitles, headlines, posters and billboards use each player's own name; personalised lines use the device voice
  - [x] `gameplay/CrimeSystem.ts`: crime record, Wanted 0–5 (snatch, grab, threaten, vehicle theft, crash), cool-down, bribe OC Kamal Pasha (৳300/star), good deeds (3 ❤️ = 1 crime wiped)
  - [x] `world/WantedBoards.ts`: wanted posters with a drawn mugshot on poles + 2 roadside "খবর ঝালমুড়ি ২৪" breaking-news billboards; HUD sirens, bribe button, headline toast; NPCs recognise a wanted hero
  - [x] `site.config.json` + landing/pause links: **Donate**, **feedback Google Form**, Facebook/YouTube (hidden until URLs are set)
  - [x] Dhaka wall palette + "natural Dhaka" colour grade (CDL + vignette) on Medium+

- [x] **Phase 2 — Mohammadpur map** (see Session log)
- [x] **Phase 3 — City life**
  - [x] `world/city/RoadGraph.ts`: graph from the minimap road segments (metres), junction choice prefers straight + bigger roads, `edgeNear` ring spawn, `nearestNode`
  - [x] `traffic/TrafficSystem.ts`: pooled traffic (10 lite … 24 high), 5 kinds as InstancedMesh (1 draw call each), left-lane following, gap keeping, corner slowdown, honking (`AudioEngine.honkAt`) + driver barks; each car is a **kinematic** Rapier body (protocol `kinematic` list) so you crash into it
  - [x] `actors/PedestrianSystem.ts`: pooled walkers (salwar-kameez aunties, uncles in panjabi/lungi, office/students) on sidewalks; flee, knocked down (pose), get up; talkable/snatchable like other NPCs (`Npc.tick`)
  - [x] Carjacking: F near a slow carjackable car → a hidden **spare** physics vehicle (stash platform at y = −200) is teleported into its pose (`VehicleInput.teleport`, stale-frame guard), driver flees, crime + headline
- [x] **Phase 4 — Combat & police**
  - [x] `gameplay/Combat.ts` (pure, tested): weapons, ray/sphere/box tests, blast falloff, cop accuracy, police per star
  - [x] Fists (Q), pistol (click; right-click aims over the shoulder; auto-aim from the hip), grenades (G; bounce, fuse, fireball, light flash, impulses throw cars — protocol `impulses`), X/Tab switch; tracers, muzzle flash, recoil; Humanoid punch/aim/throw/hands-up poses + pistol mesh
  - [x] `gameplay/PoliceSystem.ts`: foot cops chase (steer around obstacles, road-graph waypoints far away), shoot at 2+ stars, arrest when close and slow; patrol pickups with flashing lightbars route on the graph and drop cops; siren; wanted only cools when no cop within 40 m; bribe stands them down
  - [x] Health (regen to 50), hurt flash, **খতম!** (wasted → hospital bill ৳200) / **ধরা খাইলা!** (busted → ৳300 + bullets confiscated) overlays, respawn on Tajmahal Road; tea heals +25
  - [x] Crimes added: carjack, hitPedestrian, assault, shooting, copAssault (+ headlines); 61 new Bangla lines (pedestrian, aunty, driver, police, hero)
- [x] **Phase 5 — Missions**: `gameplay/Missions.ts` (pure, tested: goto / enter / talk / wanted / lose / stay+heat, timers, fail on wasted/busted), `gameplay/act1.ts` (5 missions at real places), `MissionMarkers` (yellow start / blue objective cylinders), minimap blips, objective panel + timer, pass/fail cards, rewards, progress saved (`missions` in SaveData)
- [x] **Phase 6 — rest**: leaderboard (`server/leaderboard.ts`, `/api/leaderboard`, `/leaderboard`), account page (`components/AccountPanel.tsx`: cloud save summary, change password, delete account, sign out), auth secret + DB shared via `globalThis` (fixes sessions across route bundles)
- [x] **Phase 7–8 (launch prep)**: `/privacy`, `/terms`, `/credits`; PNG + maskable + apple icons and 1200×630 share card per brand (`pnpm assets:icons`); OG/Twitter metadata, `metadataBase`, `robots.txt`, `sitemap.xml`, `siteUrl` in `site.config.json`; `docs/12-DEPLOY.md`; `apps/web/.env.example`
- [x] **Phase 7 — polish (part 2)**
  - [x] `world/Weather.ts`: `WeatherCycle` (pure, tested: dry spells → showers that ramp, thunder, roads dry slower than they get wet) + `Rain` (one LineSegments draw call around the camera; drops per tier = new preset field `rainDrops`); road/sidewalk materials go darker + glossier when wet; `Environment.wet/flash` greys sky + fog, dims the sun (soft shadows), lightning flash; `AudioEngine.setRain/thunder`; 9 new Bangla lines (hero `rainStart`/`thunder`, pedestrian/aunty/driver `rain`); pause menu: বর্ষাকাল (Auto) / রোদ / বৃষ্টি (`Game.setWeather`)
  - [x] Touch HUD editor (`components/game/HudEditor.tsx`, `hudLayout.ts`): pause → 📱 বাটন সাজাও → drag + resize the jump/run, driving pedals, weapon and enter/exit groups; saved per device (`localStorage hud.layout.v1`)
  - [x] Perf: NPC/pedestrian/cop meshes culled by hand when off-screen or > 75 m (110 m on Medium+) (`Humanoid.cull`, `SliceScene.cullActors`); cops cast shadows only on Medium+
- [x] **Act 2 — জাম্বু ভাইয়ের দল** (`gameplay/act2.ts`, unlocks after the Act 1 finale): বিয়ের মিষ্টি (fragile delivery Town Hall → Chanmiya Housing), ছিনতাইয়ের ক্লাস (3 snatches + escape), বাইকের স্পিড টেস্ট (90 km/h → Satmasjid Road), গ্যারেজের অর্ডার (2 carjacks → Bashbari garage), কল্যাণ বাজারের তাণ্ডব (4★ finale). New step kinds `crime` / `speed`, `goto.fragile`, `stay.headline`; `MissionSystem.notifyCrime`; fictional boss speaker `boroBhai` (জাম্বু ভাই) with pass lines; HUD mission counter now 0/10
- [x] **Play-test pass (2026-11-21)**: `e2e/act2-play.mjs` plays all 5 Act 2 missions start → pass in the real game (real snatching, keyboard driving to 90 km/h on Mirpur Road, real carjacks, shooting cops). Fixed what it found: starter car parked in a real side-street mouth got rammed by traffic (34 % damage before you touch it) → moved + traffic yields to all street vehicles using real widths; Town Hall / Satmasjid drop-off / OC start were 20–25 m off any road → snapped onto roads; city shop signboards read mirrored → UVs fixed
- [x] **Fresh-clone check**: clone from GitHub → `pnpm install` → typecheck, lint, 62 unit, build, 19 e2e (incl. sign-up) and `pnpm dev` all work with **no .env file** (embedded PGlite)
- [x] **Phase 7 — polish (part 3)**: wet roads cut grip (worker `VehicleInput.grip`: brakes ≈1.3× longer, less cornering) + wheel spray; **load-shedding** at night (`Blackout` in `world/Weather.ts`: lights/signs/streetlights off, headline, Bangla lines, crimes in the dark add half the heat); **haptics** (shots, hits, crashes, blasts, wasted/busted); **touch auto-fire** at cops under the crosshair while wanted; **battery saver** (30 FPS, 80 % res); subtitle size + English toggle; settings saved per device (`components/game/settings.ts`, `game.settings.v1`) and re-applied on boot. Fixed a startup crash (battery-saver ratio read before init) found by testing
- [x] **Act 3 — ওসির ডাবল গেম** (`gameplay/act3.ts`, 5 missions): mission **target vehicle** (bright yellow, `TrafficSystem.spawnMission/damageMission`, follows the road graph, never despawns, flees when hit) + step kinds **`tail`** (stay `near`–`far` m for N s; too close 3 s = spotted, > 140 m = lost) and **`destroy`** (bullets 20, ram = closing speed × 7, grenade blast); `MissionSystem.startExtras` → `spawnTarget` event; mission start radius 3.5 m. All 15 missions play-tested (`e2e/act2-play.mjs`, `e2e/act3-play.mjs`)
- [x] **Petrol pumps + garages**: `packages/content/src/stations.json` (4 pumps, 2 garages, fictional names, placed beside real main roads clear of building footprints) validated by `StationSchema`; `gameplay/Stations.ts` (pure, tested): stop on a forecourt → tank fills, paid per litre (car ৳450 / CNG ৳260 / bike ৳180 a tank; stops when broke); stop in a garage 2.5 s → repair (৳8 per damage %) + respray ৳500 that wipes the wanted level unless a cop is within 20 m; one service per visit. `world/StationProps.ts`: canopy/dispensers or open shed + lit Bangla signboards, fixed physics boxes + camera colliders. HUD status pill, ⛽/🔧 on minimap + full map, low/empty-fuel lines, pump attendant + mechanic speakers
- [x] **Police fixes found while testing**: patrol cars that circle without getting closer no longer block foot cops forever (foot cops spawn after 8 s); when the player is off every road the car pulls over after 10 s without progress; foot cops stuck behind a building for 8 s despawn so fresh ones come from elsewhere
- [x] **Launched (2026-11-22)**: Neon (Singapore) connected + verified; Vercel project (root `apps/web`, functions `sin1`). Fixed on the way: pnpm 12 CI install (`allowBuilds: esbuild: false` in `pnpm-workspace.yaml`) and INVALID_ORIGIN on sign-up (auth now trusts the deployment's Vercel URLs and ignores a localhost `BETTER_AUTH_URL` on Vercel — `lib/siteUrl.ts`). Live round-trip (sign-up → hero → save → leaderboard → password → delete) passes; game boots live in ~6 s with no errors
- [x] **Owner feedback round 1 (2026-11-22: "too dark, cartoonish, hard controls")**: Khronos Neutral tone mapping (ACES crushed colour/brightness), lifted grade, much brighter moonlit night; **street lamps + warm light pools along every main OSM road** (`CityWorld` lamps/pools, `nightGlows`); characters rebuilt with smooth lathe shapes (V-taper torso, traps, deltoids, muscle-shaped limbs, hands with fingers, rounded shoes, face with cheeks/chin/nose bridge/lips/iris+pupil, sideburns); new 3-phase punch + guard stance + hit reaction; pelvis roll in the gait; **easy keyboard controls** (default on desktop: A/D turn, W/S forward/back, camera follows; toggle in settings); dedicated **E = talk** (+ 💬 button, forgiving range, menu stays open until you walk away). Tests never touch the real DB (Playwright env), auth rate limit off only for the test server
- [ ] **Still to do from that feedback**: realistic 3D people + cars need downloaded models (owner permission), shops with visible goods / enterable shops, more crowds, radio/music, male/female Bangla voices, drainage, bullet/explosion effects polish

## ▶ NEXT STEP
**Owner:** on Vercel set `BETTER_AUTH_URL` and `NEXT_PUBLIC_SITE_URL` to `https://open-city-dhaka-swg5.vercel.app` (they still say localhost; the code copes, but keep them right — and update both if you add a custom domain). Fill `site.config.json` (donate, Google Form, socials). Play on a real phone and send feedback. Optional: Google login keys.

**Next coding steps (recommended order):**
1. Real-phone performance pass (actors are now culled off-screen; facing a crowd mobile headless ≈ 216 calls — if phones struggle, lower pools on Mobile or drop rain/shadows)
2. Act 4 / new area (design doc: Dhanmondi–Farmgate); step kinds still missing: escort/deliver a passenger, timed checkpoints race vs AI
3. Drive-by shooting, cop cars that ram/chase as physics vehicles, helicopter at 5 stars
4. Puddle decals / deep-water zones, radio stations, in-game phone, outfits shop
5. Server-side scoring for leaderboards (currently from client saves, clamped)

**Older notes (still valid):**
**Owner to fill in:** `site.config.json` → `donateUrl` (bKash/Nagad merchant page, Buy Me a Coffee, etc.), `feedbackFormUrl` (Google Form link), socials.

**Next coding step (recommended): login (Phase 6 auth pulled forward)** so players can save their own hero name: Better Auth (Google + email) + PostgreSQL (Neon free) + profile table (title, name) + server-side `checkHeroText` validation. Owner needs: free Neon database URL + Google OAuth client (steps will be in `.env.example`).

**Waiting on the owner (Part B):**
1. **Azure Speech key** (free F0) in `apps/web/.env.local` → run `pnpm voice:gen` → commit `apps/web/public/assets/voice/` (steps in `docs/10-AUDIO-DIALOGUE.md`).
2. **Models** into `assets-src/incoming/`: MakeHuman characters (CC0), Mixamo animations, CC0/CC-BY car models (steps in `docs/11-ART-REALISM.md §6`). Then: build glTF loading (Meshopt/KTX2), swap placeholders, add facial blendshapes + lip sync.
3. Real-phone test + feedback.

**In parallel the next coding phase can start: Phase 2 — Mohammadpur map** (see `docs/03-ROADMAP.md`):
1. `tools/map-builder`: OSM export (Overpass) → roads, footprints, water (Beribadh)
2. Chunks (128 m) reusing `world/StreetBlock.ts` generators driven by OSM data
3. Streaming + skyline impostors + IndexedDB cache; lane graph + navmesh
4. Landmarks, minimap/full map, water physics at Beribadh
5. Keep Lite ≤ 150 draw calls, 30 FPS on phones

## Phase 3–5 result — notes for whoever continues
- Physics ids: player 1, vehicles 10+ (3 parked + 3 spares), ball 50, NPC colliders 100+, traffic 400+, police cars 450+, stash 990, statics 1000+.
- Traffic and police cars are kinematic boxes; when inactive they are parked at y ≈ −80/−90. Spare carjack vehicles live on a hidden platform at y = −200 (`STASH_Y`).
- Headless Chromium runs at ~3 FPS with dt clamped to 0.1 s → game time runs ~0.3× real time in tests; use long waits (see `busted-check.mjs`).
- Mission coordinates are metres from Tajmahal Road (map anchor). POIs in `index.json` are metres too (chunk files are decimetres).
- New CrimeKinds must be added to `CRIME_KINDS` (save/load iterates it).

## Phase 1 result — notes for whoever continues
- Character is **procedural** on purpose (tiny, no licences, no foot sliding). `Humanoid.update(dt, LocomotionState)` is the contract — a skinned glTF model can replace it later without touching `SliceScene`.
- Vehicles face **+Z**, traffic keeps **left** (x > 0 carriageway goes +Z). Rapier forward axis is set with `controller.setIndexForwardAxis = 2`. Positive wheel steering = left.
- Physics frame layout: `FLOATS_PER_BODY = 12` (id, pos, quat, grounded, vel) + vehicle array (id, speed, wheelCount, 4 floats per wheel). See `physics/protocol.ts`.
- Rendering smoothing: `SmoothedBody` in `SliceScene` extrapolates by velocity and damps, so worker frames arriving unevenly don't stutter.
- Night lighting uses **no real lights** (emissive + additive light pools) — keep it that way for phones.
- Playwright e2e runs with `workers: 1`: software-rendered WebGPU in parallel browsers starves the CPU and makes timing tests flaky.

## Phase 0 result — notes for whoever continues
- **Bundler:** app uses **webpack** (`next dev --webpack`, `next build --webpack`). Turbopack copied `new Worker(new URL(...))` as a raw `.ts` file instead of compiling it. Re-test Turbopack later.
- **COOP/COEP is site-wide** (`next.config.ts`): an isolated page can only start workers/service workers whose own responses carry COEP. Uses `credentialless` so CDN assets still load.
- **Game Lock never blocks boot:** every lock step has a 1.5 s timeout (permission prompts can hang forever); `PlayClient` starts `lock.enter()` inside the tap but doesn't await it.
- **Headless testing:** launch Chromium with `--enable-unsafe-webgpu --use-angle=swiftshader`, otherwise WebGPU canvases screenshot as black. The in-app browser pane of the Claude desktop app blocks workers/service workers, so use Playwright for real checks (`apps/web/e2e/diagnose.mjs`).
- Touch HUD shows when the primary pointer is coarse (phone/tablet) or after a real finger touch (touch laptops).

## Decisions log
| Date | Decision | Why |
|---|---|---|
| 2026-11-20 | Browser game, Next.js + Node.js, three.js + Rapier | Owner request; lightest mature stack |
| 2026-11-20 | First map = Mohammadpur, Dhaka (from OpenStreetMap) | Owner request; expand later |
| 2026-11-20 | All devices from day one (phone landscape full screen + Game Lock, tablet, laptop, desktop) | Owner request |
| 2026-11-20 | Original parody characters, no real living people/parties (recommended, owner to confirm) | Legal & takedown risk |
| 2026-11-20 | Everything data-driven & modular so features can be improved anytime | Owner request (see `docs/08-EXTENDING.md`) |
| 2026-11-20 | Active name GTM: Great Thief Mostofa (hero-based, works for all Bangladesh); repo name neutral: open-city-dhaka | Owner asked for my best pick |
| 2026-11-20 | Progress handoff via this file, updated + pushed every session | Owner request |
| 2026-11-20 | Working title MVP: Mostofa Vs Pulish, hero = Mostofa; name only in `brand.config.json` | Owner request; must stay changeable |
| 2026-11-21 | Database: PostgreSQL (Neon) + Drizzle | Owner confirmed |
| 2026-11-21 | Next.js built with webpack, not Turbopack | Turbopack didn't compile the physics Web Worker |
| 2026-11-21 | COOP/COEP (credentialless) on every route | Workers & service worker must carry COEP on an isolated page |
| 2026-11-21 | Procedural character + vehicles (no downloaded 3D assets yet) | No licence risk, tiny download, full control; swap for skinned models later |
| 2026-11-21 | Night lighting via emissive + fake light pools, no dynamic lights | Phone performance |
| 2026-11-21 | Hero = smart young mastan (jeans/shirt/sunglasses), lungi only as NPC/outfit | Owner feedback |
| 2026-11-21 | Lines are original, written per archetype; voices recorded later (subtitles now) | No copying other games/films; funniest delivery needs real actors |
| 2026-11-21 | Procedural characters baked into one skinned mesh each | Draw calls on phones (was ~60 per character) |
| 2026-11-21 | Sounds synthesized with Web Audio until recorded samples exist | Zero download size, no licences |
| 2026-11-21 | Free route: CC0 textures (Poly Haven), device TTS + Azure free-tier generated voices; models via MakeHuman/Mixamo/CC0 once owner downloads | Owner choice |
| 2026-11-21 | Hero stays Mostofa by default; signed-in players may set title + name (moderated) | Owner request; login-gated to limit abuse |
| 2026-11-21 | Wanted level is shared by posters, billboards, headlines and (Phase 4) police | One system, many funny surfaces |
| 2026-11-21 | Traffic/police as kinematic bodies on the OSM road graph; carjack via spare physics vehicles | Cheap (instanced, no AI physics) yet you can crash into them |
| 2026-11-21 | Leaderboard reads client cloud saves (clamped), hero names only | Fun first; move scoring server-side before competitive play |
| 2026-11-20 | Player is a rising criminal (snatching, extortion, looting, robbery, vandalism, carjacking), GTA-style; all gangs/parties fictional | Owner request |

## Open questions for the owner
- [ ] Final game name (working title set, can change)
- [ ] OK with parody characters instead of real people?
- [ ] Reference image mentioned earlier (not received)
- [ ] Free for now / monetisation later?

## Known issues / tech debt
- CSP uses `script-src 'unsafe-inline'` → switch to nonces (Phase 6)
- Turbopack can't build the physics worker (see notes above)
- Medium/Mobile with shadows ≈ 155 draw calls (shadow pass doubles them); fine on desktop, watch on phones
- Parked vehicles can be pushed by walking into them (light parked brake) — OK for now
- No real-phone test yet (only headless Chromium phone emulation)
- Characters and cars are still code-generated shapes (not realistic) until Part B assets arrive
- Generated voices need the owner's free Azure key; until then device TTS (not on most iPhones) + subtitles
- Software GPU (CI/headless) can run out of memory if several game sessions run in one browser back-to-back; e2e runs serially and passes
- Vehicle damage is HUD/smoke only, no visible dents yet (needs real car models)
- Police still have no navmesh: in dense blocks (e.g. Kalyan Bazar) some cops get stuck behind shop rows until the patrol car finds a way round (~30 s)
- Pedestrians walk sidewalks but never cross roads; cops/peds can clip small objects (no navmesh)
- Police cars are kinematic (drive the graph and park), no drive-by shooting yet
- Leaderboard values come from client saves (clamped) — cheatable
- Draw calls rose with traffic/peds/police (mobile headless ≈ 100 normally, ≈ 216 facing a crowd) — needs a real-phone check
- Character has no hands-on-wheel pose in cars/CNG (player is hidden inside); only the bike shows the rider

## Session log (newest first)
| Date | Who | What was done | Where it stopped |
|---|---|---|---|
| 2026-11-22 | Claude (Opus 5.5) | Feedback round 1: lighting (day/night), city street lamps, smoother human bodies/faces, punch/guard/hit animations, easy controls + E talk; e2e isolated from Neon | Waiting on owner: OK to download realistic CC0/CC-BY models? |
| 2026-11-22 | Claude (Opus 5.5) | Launch: Neon connected + verified, Vercel deploy fixed (pnpm 12 build scripts, auth origin), live site checked (pages, game boot, account round-trip) | Live; next: owner phone test, Act 4 |
| 2026-11-22 | Claude (Opus 5.5) | Petrol pumps + garages (refuel per litre, repair, respray clears wanted), station props/signs/minimap; police routing fixes (stalled patrol cars, stuck cops); all 15 missions + station/polish checks re-run green; 70 unit + 19 e2e | Next: Act 4 / new area, real-phone test |
| 2026-11-22 | Claude (Opus 5.5) | Phase 7 polish part 3 (wet grip, spray, load-shedding, haptics, auto-fire, battery saver, saved settings) + Act 3 (target vehicles, tail/destroy steps, 5 missions); everything play-tested in the real game; 66 unit + 19 e2e | Next: refuelling + Act 4 / real-phone test |
| 2026-11-21 | Claude (Opus 5.5) | Self play-test of all Act 2 missions (act2-play.mjs, all pass) + 3 real bugs fixed (parked car rammed by traffic, off-road mission targets, mirrored signs); fresh-clone setup verified end to end | Owner: run locally / deploy; then Act 3 |
| 2026-11-21 | Claude (Opus 5.5) | Act 2: 5 missions (act2.ts), crime/speed/fragile step kinds, giver pass lines, missions-done HUD fix; 62 unit + 19 e2e passing; `e2e/act2-check.mjs` | Next: real-phone test, then Act 3 |
| 2026-11-21 | Claude (Opus 5.5) | Phase 7 polish: monsoon rain (cycle, streaks, wet roads, grey sky, thunder, sounds, Bangla lines, menu toggle), touch HUD editor, off-screen actor culling, cop shadows Medium+; 60 unit + 19 e2e passing | Real-phone test by owner; then Act 2 |
| 2026-11-21 | Claude (Opus 5.5) | Autonomous run (owner asleep): Phase 3 traffic/pedestrians/carjacking, Phase 4 combat + police + wasted/busted, Phase 5 mission framework + Act 1 (5 missions), Phase 6 leaderboard + account page (change password, delete) + auth-secret/DB sharing fix, Phase 7–8 legal pages, icons, SEO, deploy guide; 57 unit + 18 e2e passing | Ready for owner to deploy (docs/12-DEPLOY.md) and real-phone test |
| 2026-11-21 | Claude (Opus 5.5) | Phase 2: OSM fetch (Overpass mirrors) + map builder (anchor on Tajmahal Road, chunks, colliders, minimap, POIs), CityWorld streaming (roads, sidewalks, lane dashes, extruded buildings with shops/signs, water tanks, parks, water), 18k building colliders in physics (static bodies no longer sent per frame), GTA-style rotating minimap + full map | Continuing: Phase 3 traffic & pedestrians |
| 2026-11-21 | Claude (Opus 5.5) | Phase 6 login: Better Auth (email/password, Google when keys set), Drizzle + Postgres (Neon via DATABASE_URL, embedded PGlite locally), /login page, /api/profile (server-validated hero title/name), /api/save (cloud save, size/zod/rate limited), autosave, signed-in hero editor | Continuing autonomously: Phase 2 map next (OSM data downloaded) |
| 2026-11-21 | Claude (Opus 5.5) | Hero identity (login-gated editor), crime record + Wanted 0–5, bribe OC, good-deed redemption, wanted posters + news billboards with player's name, headline toasts, NPC recognition, donate/feedback links via site.config.json, Dhaka palette + colour grade | Next: login (Phase 6 auth) or Phase 2 map |
| 2026-11-21 | Claude (Opus 5.5) | Free route: downloaded & verified 6 CC0 Poly Haven texture sets, applied to road/footpath/walls/awnings/poles; device Bangla AI voice per character + voice selector; Azure `voice:gen` tool | Waiting on owner: Azure key, model downloads; Phase 2 can start |
| 2026-11-21 | Claude (Opus 5.5) | Phase 1.5 Part A: mastan hero with expressive face, skinned characters, 4 talking NPCs, 60 funny Bangla lines + subtitles, talk/order/snatch menu, money & reputation, synthesized engine/horn/crash/footstep/city sounds, funny posters & banner, fuel + zone damage dashboard, dust/smoke particles; docs 10 & 11 | Waiting on owner: asset route + voices (Part B), real-phone test |
| 2026-11-21 | Claude (Opus 5.5) | Built Phase 1: procedural Mostofa with gait animation, collision camera, car/CNG/bike physics + enter/exit, Tajmahal Road block with Bangla signs & wires, day–night + bloom, driving HUD & touch pedals, pause-menu quality switch; 29 unit + 8 e2e tests; tuned braking | Phase 1 done; owner to test on a real phone, then Phase 2 |
| 2026-11-21 | Claude (Opus 5.5) | Built Phase 0: monorepo, engine (renderer, loop, input, presets, Game Lock, physics worker, test scene), Next.js app (landing, /play, touch HUD, PWA, headers), tests, CI; verified desktop + phone in headless Chromium | Phase 0 done; start Phase 1 |
| 2026-11-20 | Claude (Opus 5.5) | Active name → GTM: Great Thief Mostofa; connected GitHub repo open-city-dhaka and pushed | Waiting for DB choice before Phase 0 |
| 2026-11-20 | Claude (Opus 5.5) | Brand presets: switch name by changing `"active"` (mvp / gtb "Gaye Tel Beshi" / mwm) | Waiting for repo URL + DB choice |
| 2026-11-20 | Claude (Opus 5.5) | Set working title MVP: Mostofa Vs Pulish via brand.config.json; rewrote story/missions for crime-career | Waiting for repo URL + DB choice before Phase 0 |
| 2026-11-20 | Claude (Opus 5.5) | Wrote all planning docs (01–08), mobile/all-device spec, feature checklist, extend guide, handoff system; git init + first commit | Waiting for owner's name/repo/DB answers before Phase 0 |
