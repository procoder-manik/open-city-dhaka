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
| Current phase | **Phase 0 ✅ done → Phase 1 ("Feel" vertical slice) next** |
| Overall progress | Planning 100 % · P0 100 % · P1 0 % |
| Game name | Working title **GTM: Great Thief Mostofa** ("Bangladesh's Most Wanted"), set in `brand.config.json`, changeable anytime (`docs/09-BRANDING.md`) |
| GitHub repo | https://github.com/procoder-manik/open-city-dhaka (branch `main`) |
| Database | **PostgreSQL (Neon) + Drizzle**, confirmed by owner. Not wired yet (Phase 6) |
| Build status | `pnpm typecheck`, `lint`, `test` (18 unit), `build`, `e2e` (6 Playwright, desktop + phone) all pass locally. CI workflow added, not yet seen running on GitHub |

## How to run
```bash
pnpm install
pnpm dev            # http://localhost:3000  (game at /play, add ?debug=1 to expose window.__game)
pnpm build && pnpm start
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @game/web exec playwright install chromium   # once
pnpm build && pnpm e2e
```

## Phase tracker
Legend: ⬜ not started · 🟨 in progress · ✅ done · ⏸ blocked

| Phase | Name | Status | Notes |
|---|---|---|---|
| — | Planning docs | ✅ | `docs/01`–`09` |
| P0 | Foundation (monorepo, Next.js, engine boot, Game Lock, PWA, CI) | ✅ | See "Phase 0 result" below |
| P1 | "Feel" vertical slice (character, camera, 3 vehicles, one street, touch controls) | ⬜ | Next |
| P2 | Mohammadpur map (OSM pipeline, streaming, landmarks) | ⬜ | |
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
  - [x] Engine (`packages/engine/src`): `Game.ts` (createGame), `core/FixedStepLoop`, `render/createRenderer` (three.js WebGPURenderer, WebGL2 fallback), `input/InputManager` (keyboard/mouse + touch + gamepad → actions, taps never lost), `platform/device|quality|DynamicResolution`, `gamelock/GameLock`, `physics/*` (Rapier in a Web Worker, inline fallback), `scenes/TestScene` (street, buildings, crates, ball, capsule player, 3rd-person camera), `state/store` (zustand)
  - [x] Next.js 16 app (`apps/web`): landing `/`, `/play` (start screen, quality select, loading, HUD stats, pause menu, touch joystick/look/buttons, rotate-phone hint), `/api/health`, PWA manifest + `public/sw.js`, security headers + CSP (prod), site-wide COOP/COEP
  - [x] Physics worker entry is app-owned: `apps/web/workers/physics.worker.ts` → `@game/engine/physics-worker`
  - [x] Asset pipeline: `tools/asset-pipeline/optimize.mjs` (Meshopt), `check-budget.mjs` + `budgets.json` (`pnpm budget`)
  - [x] ESLint, Prettier, Vitest (18 tests), Playwright smoke (desktop + phone), GitHub Actions CI (`.github/workflows/ci.yml`)
  - [x] Verified in headless Chromium: boots in ~0.8 s, physics in worker, service worker active, cross-origin isolated, keyboard + joystick movement, Esc pause

## ▶ NEXT STEP
**Phase 1 — "Feel" vertical slice** (see `docs/03-ROADMAP.md`). Suggested order:
1. Replace capsule with a rigged humanoid (Quaternius CC0 / Mixamo) + animation state machine (idle/walk/jog/sprint/jump/fall/land, turn-in-place) in `packages/engine/src/actors/`
2. Camera: collision (raycast so it never goes into walls, visible today), sprint FOV kick, shake, aim mode → `packages/engine/src/camera/`
3. Vehicles: Rapier raycast vehicle controller (car, motorbike, CNG) + enter/exit, touch vehicle layout
4. One hand-built Tajmahal Road block (shops, signboards, wires, tea stall) replacing `TestScene`
5. Lighting/post: sky, golden-hour grade, bloom (Medium+), quick day–night
6. Pause menu: quality switch at runtime, controls help
7. Test on a real mid Android phone (target 30 FPS) and a laptop (60 FPS)

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
| 2026-11-20 | Player is a rising criminal (snatching, extortion, looting, robbery, vandalism, carjacking), GTA-style; all gangs/parties fictional | Owner request |

## Open questions for the owner
- [ ] Final game name (working title set, can change)
- [ ] OK with parody characters instead of real people?
- [ ] Reference image mentioned earlier (not received)
- [ ] Free for now / monetisation later?

## Known issues / tech debt
- CSP uses `script-src 'unsafe-inline'` → switch to nonces (Phase 6)
- PWA icons are SVG only; iOS home-screen icon needs PNG (Phase 7)
- Camera has no collision yet: goes into building walls (Phase 1)
- Playwright boot test takes ~33 s in the runner although the game boots in < 1 s; cause not investigated
- Turbopack can't build the physics worker (see notes above)

## Session log (newest first)
| Date | Who | What was done | Where it stopped |
|---|---|---|---|
| 2026-11-21 | Claude (Opus 5.5) | Built Phase 0: monorepo, engine (renderer, loop, input, presets, Game Lock, physics worker, test scene), Next.js app (landing, /play, touch HUD, PWA, headers), tests, CI; verified desktop + phone in headless Chromium | Phase 0 done; start Phase 1 |
| 2026-11-20 | Claude (Opus 5.5) | Active name → GTM: Great Thief Mostofa; connected GitHub repo open-city-dhaka and pushed | Waiting for DB choice before Phase 0 |
| 2026-11-20 | Claude (Opus 5.5) | Brand presets: switch name by changing `"active"` (mvp / gtb "Gaye Tel Beshi" / mwm) | Waiting for repo URL + DB choice |
| 2026-11-20 | Claude (Opus 5.5) | Set working title MVP: Mostofa Vs Pulish via brand.config.json; rewrote story/missions for crime-career | Waiting for repo URL + DB choice before Phase 0 |
| 2026-11-20 | Claude (Opus 5.5) | Wrote all planning docs (01–08), mobile/all-device spec, feature checklist, extend guide, handoff system; git init + first commit | Waiting for owner's name/repo/DB answers before Phase 0 |
