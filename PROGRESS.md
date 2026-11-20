# PROGRESS — read this first

> **For any AI or developer picking up this project:** this file is the single source of truth for *where the work stopped*.
> 1. Read this file fully, then `AGENTS.md`, then the docs it points to.
> 2. Continue from **"▶ NEXT STEP"** below. Don't redo finished work.
> 3. Before you stop (or when your limit is close), **update this file** (Status, Done, Next Step, Session Log), then commit and push to GitHub.

---

## Status snapshot
| Field | Value |
|---|---|
| Last updated | 2026-11-20 |
| Updated by | Claude (Opus 5.5) |
| Current phase | **Planning complete → Phase 0 not started** |
| Overall progress | Planning 100 % · Code 0 % |
| Game name | **Not final** (shortlist in `docs/01-PRD.md §11`) |
| GitHub repo | Owner is creating it. Remote not set yet |
| Database | Proposed PostgreSQL (Neon) + Drizzle. **Awaiting owner confirmation** |
| Build status | No code yet |

## Phase tracker
Legend: ⬜ not started · 🟨 in progress · ✅ done · ⏸ blocked

| Phase | Name | Status | Notes |
|---|---|---|---|
| — | Planning docs | ✅ | `docs/01`–`08` |
| P0 | Foundation (monorepo, Next.js, engine boot, Game Lock, PWA, CI) | ⬜ | Waiting on name + repo + DB decision |
| P1 | "Feel" vertical slice (character, camera, 3 vehicles, one street, touch controls) | ⬜ | |
| P2 | Mohammadpur map (OSM pipeline, streaming, landmarks) | ⬜ | |
| P3 | Vehicles & city life (traffic, peds, carjacking) | ⬜ | |
| P4 | Combat, weapons & police (Thana Alert) | ⬜ | |
| P5 | Missions & story Act 1 | ⬜ | |
| P6 | Backend, accounts, cloud saves, leaderboards | ⬜ | |
| P7 | Polish (audio, weather, phone, HUD editor, perf) | ⬜ | |
| P8 | Launch | ⬜ | |
| P9+ | Expansion (Dhaka areas, Cox's Bazar, multiplayer) | ⬜ | |

## ✅ Done so far
- [x] PRD: `docs/01-PRD.md`
- [x] Architecture: `docs/02-ARCHITECTURE.md`
- [x] Roadmap / phases: `docs/03-ROADMAP.md`
- [x] Game design (story, characters, Mohammadpur map, missions, systems): `docs/04-GAME-DESIGN.md`
- [x] Research & risks: `docs/05-RESEARCH.md`
- [x] Platforms & mobile (Game Lock, touch, PWA, presets): `docs/06-PLATFORMS-MOBILE.md`
- [x] Feature checklist: `docs/07-FEATURE-CHECKLIST.md`
- [x] How to extend the game later: `docs/08-EXTENDING.md`
- [x] Handoff system: this file + `AGENTS.md` + `CLAUDE.md`
- [x] Local git repo initialised, docs committed

## ▶ NEXT STEP
**Start Phase 0 — Foundation** once the owner confirms:
1. Game name (shortlist in PRD §11)
2. GitHub repo URL → `git remote add origin <url>` and push `main`
3. Database: PostgreSQL (Neon) or MongoDB Atlas

Phase 0 task list (tick as you go, see `docs/03-ROADMAP.md`):
- [ ] pnpm + Turborepo monorepo: `apps/web`, `packages/engine`, `packages/shared`, `packages/content`, `tools/map-builder`, `tools/asset-pipeline`
- [ ] Next.js 16 app: landing placeholder, client-only `/play`, security headers, COOP/COEP on `/play`
- [ ] Engine boot: three.js WebGPU→WebGL2 renderer, fixed-step loop, debug overlay
- [ ] Action-based input: keyboard/mouse + touch + gamepad
- [ ] Device detection + quality presets (Lite/Mobile/Medium/High/Ultra)
- [ ] Game Lock: fullscreen, landscape lock, no zoom/scroll/long-press, back-gesture → pause, wake lock
- [ ] PWA manifest + service worker
- [ ] Rapier physics worker + test scene (ground + falling cube)
- [ ] Asset pipeline (gltf-transform, Meshopt, KTX2) + size budget check
- [ ] ESLint, Prettier, Vitest, Playwright smoke test, GitHub Actions CI
- [ ] `.env.example`, README run instructions
- [ ] Verify on PC browser + phone emulation; update this file; commit & push

## Decisions log
| Date | Decision | Why |
|---|---|---|
| 2026-11-20 | Browser game, Next.js + Node.js, three.js + Rapier | Owner request; lightest mature stack |
| 2026-11-20 | First map = Mohammadpur, Dhaka (from OpenStreetMap) | Owner request; expand later |
| 2026-11-20 | All devices from day one (phone landscape full screen + Game Lock, tablet, laptop, desktop) | Owner request |
| 2026-11-20 | Original parody characters, no real living people/parties (recommended, owner to confirm) | Legal & takedown risk |
| 2026-11-20 | Everything data-driven & modular so features can be improved anytime | Owner request (see `docs/08-EXTENDING.md`) |
| 2026-11-20 | Progress handoff via this file, updated + pushed every session | Owner request |

## Open questions for the owner
- [ ] Final game name
- [ ] GitHub repo URL
- [ ] DB choice (PostgreSQL recommended)
- [ ] OK with parody characters instead of real people?
- [ ] Reference image mentioned earlier (not received)
- [ ] Free for now / monetisation later?

## Known issues / tech debt
_None yet._

## Session log (newest first)
| Date | Who | What was done | Where it stopped |
|---|---|---|---|
| 2026-11-20 | Claude (Opus 5.5) | Wrote all planning docs (01–08), mobile/all-device spec, feature checklist, extend guide, handoff system; git init + first commit | Waiting for owner's name/repo/DB answers before Phase 0 |
