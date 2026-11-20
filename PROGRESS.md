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
| Current phase | **Phase 1 ✅ done (feel slice) → Phase 2 (Mohammadpur map) next** |
| Overall progress | Planning 100 % · P0 100 % · P1 100 % (real-phone test pending) · P2 0 % |
| Game name | Working title **GTM: Great Thief Mostofa** ("Bangladesh's Most Wanted"), set in `brand.config.json`, changeable anytime (`docs/09-BRANDING.md`) |
| GitHub repo | https://github.com/procoder-manik/open-city-dhaka (branch `main`) |
| Database | **PostgreSQL (Neon) + Drizzle**, confirmed by owner. Not wired yet (Phase 6) |
| Build status | `pnpm typecheck`, `lint`, `test` (29 unit), `build`, `e2e` (8 Playwright, desktop + phone) all pass locally. CI run on GitHub not yet checked |

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
```

## Phase tracker
Legend: ⬜ not started · 🟨 in progress · ✅ done · ⏸ blocked

| Phase | Name | Status | Notes |
|---|---|---|---|
| — | Planning docs | ✅ | `docs/01`–`09` |
| P0 | Foundation (monorepo, Next.js, engine boot, Game Lock, PWA, CI) | ✅ | See "Phase 0 result" below |
| P1 | "Feel" vertical slice (character, camera, 3 vehicles, one street, touch controls) | ✅ | See "Phase 1 result"; real-phone test pending |
| P2 | Mohammadpur map (OSM pipeline, streaming, landmarks) | ⬜ | Next |
| P3 | Vehicles & city life (traffic, peds, carjacking) | ⬜ | |
| P4 | Combat, weapons & police (Thana Alert) | ⬜ | |
| P5 | Missions & story Act 1 | ⬜ | |
| P6 | Backend, accounts, cloud saves, leaderboards | ⬜ | |
| P7 | Polish (audio, weather, phone, HUD editor, perf) | ⬜ | |
| P8 | Launch | ⬜ | |
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

## ▶ NEXT STEP
**First:** owner tests Phase 1 on a real mid-range Android phone + a laptop and gives feel feedback (walk speed, camera distance, driving). Tune `vehicles.json` / constants in `scenes/SliceScene.ts` from that.

**Then Phase 2 — Mohammadpur map** (see `docs/03-ROADMAP.md`). Suggested order:
1. `tools/map-builder`: export Mohammadpur from OpenStreetMap (Overpass) → roads (with widths/lanes), building footprints, water (Beribadh)
2. Generate chunks (128 m) reusing `world/StreetBlock.ts` building/shop/sign/wire generators, but driven by OSM footprints instead of a straight street
3. Chunk streaming + far skyline impostors + IndexedDB cache; lane graph + navmesh output for Phase 3
4. Hand-made landmarks: Asad Gate, Town Hall bazar, Thana, Krishi Market, bus stand, Japan Garden City, Beribadh haat
5. Minimap + full map from the same data
6. Keep Lite ≤ 150 draw calls and 30 FPS on phones

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
| 2026-11-20 | Player is a rising criminal (snatching, extortion, looting, robbery, vandalism, carjacking), GTA-style; all gangs/parties fictional | Owner request |

## Open questions for the owner
- [ ] Final game name (working title set, can change)
- [ ] OK with parody characters instead of real people?
- [ ] Reference image mentioned earlier (not received)
- [ ] Free for now / monetisation later?

## Known issues / tech debt
- CSP uses `script-src 'unsafe-inline'` → switch to nonces (Phase 6)
- PWA icons are SVG only; iOS home-screen icon needs PNG (Phase 7)
- Turbopack can't build the physics worker (see notes above)
- Medium/Mobile with shadows ≈ 155 draw calls (shadow pass doubles them); fine on desktop, watch on phones
- Parked vehicles can be pushed by walking into them (light parked brake) — OK for now
- No real-phone test yet (only headless Chromium phone emulation)
- Character has no hands-on-wheel pose in cars/CNG (player is hidden inside); only the bike shows the rider

## Session log (newest first)
| Date | Who | What was done | Where it stopped |
|---|---|---|---|
| 2026-11-21 | Claude (Opus 5.5) | Built Phase 1: procedural Mostofa with gait animation, collision camera, car/CNG/bike physics + enter/exit, Tajmahal Road block with Bangla signs & wires, day–night + bloom, driving HUD & touch pedals, pause-menu quality switch; 29 unit + 8 e2e tests; tuned braking | Phase 1 done; owner to test on a real phone, then Phase 2 |
| 2026-11-21 | Claude (Opus 5.5) | Built Phase 0: monorepo, engine (renderer, loop, input, presets, Game Lock, physics worker, test scene), Next.js app (landing, /play, touch HUD, PWA, headers), tests, CI; verified desktop + phone in headless Chromium | Phase 0 done; start Phase 1 |
| 2026-11-20 | Claude (Opus 5.5) | Active name → GTM: Great Thief Mostofa; connected GitHub repo open-city-dhaka and pushed | Waiting for DB choice before Phase 0 |
| 2026-11-20 | Claude (Opus 5.5) | Brand presets: switch name by changing `"active"` (mvp / gtb "Gaye Tel Beshi" / mwm) | Waiting for repo URL + DB choice |
| 2026-11-20 | Claude (Opus 5.5) | Set working title MVP: Mostofa Vs Pulish via brand.config.json; rewrote story/missions for crime-career | Waiting for repo URL + DB choice before Phase 0 |
| 2026-11-20 | Claude (Opus 5.5) | Wrote all planning docs (01–08), mobile/all-device spec, feature checklist, extend guide, handoff system; git init + first commit | Waiting for owner's name/repo/DB answers before Phase 0 |
