# Technical Architecture

## 1. High-level overview

```
                        ┌──────────────────────── Browser ─────────────────────────┐
                        │                                                           │
 Player ──► Next.js site (landing, auth, profile, leaderboards)                     │
                        │        │                                                  │
                        │        ▼   /play  (client-only, lazy-loaded)              │
                        │  ┌──────────────── GAME CLIENT (packages/engine) ───────┐ │
                        │  │ Renderer: three.js WebGPURenderer → WebGL2 fallback  │ │
                        │  │ Physics: Rapier3D (WASM) in a Web Worker              │ │
                        │  │ ECS-lite world, AI, missions, audio, input            │ │
                        │  │ World streamer ── fetches chunk .glb / .bin ──────────┼─┼──► CDN (Cloudflare R2 / Vercel static)
                        │  │ UI overlay: React (HUD, menus, phone) via zustand     │ │
                        │  └───────────────────────────┬───────────────────────────┘ │
                        └──────────────────────────────┼─────────────────────────────┘
                                                       │ HTTPS (JSON, zod-validated)
                                                       ▼
                         Next.js Route Handlers / Server Actions (Node runtime)
                         auth · saves · leaderboards · stats · admin · flags
                               │                     │
                               ▼                     ▼
                     PostgreSQL (Neon free)    Redis (Upstash free)
                     Drizzle ORM               rate limit · leaderboard cache

            (Phase 9+) Realtime server: Node + Colyseus on Fly.io/Render ── WebSocket ── clients
```

Key principle: **the game runs fully client-side** (single-player); the backend only stores identity, saves, stats and validates leaderboard submissions. This keeps hosting free/cheap and the game playable offline-ish after load.

## 2. Tech stack (decisions)

| Layer | Choice | Why |
|---|---|---|
| Monorepo | **pnpm workspaces + Turborepo** | Share types between site, engine, server, tools |
| Language | **TypeScript (strict)** everywhere | Safety across a big codebase |
| Website / app shell | **Next.js 16 (App Router), React 19** | Requested; SSR for SEO pages, client-only `/play` |
| Styling | Tailwind CSS v4 + custom HUD CSS | Fast UI building |
| 3D renderer | **three.js** (`WebGPURenderer` with automatic WebGL2 fallback, TSL node materials) | Smallest mature engine, huge ecosystem, full control. R3F only for menus/showroom, *not* the game loop (avoid React overhead per frame) |
| Physics | **Rapier3D** (`@dimforge/rapier3d-compat`) | Fast WASM, character controller + raycast vehicle controller built in, deterministic |
| Animation | three `AnimationMixer` + custom blend-tree/state machine, shared humanoid skeleton | Retarget once, reuse for all NPCs |
| Pathfinding | `recast-navigation` (WASM) for pedestrians; lane graph for traffic | Industry standard navmesh |
| Audio | Web Audio API (thin wrapper) + `howler` for music streams | Spatial audio, low overhead |
| UI state | **zustand** (shared between engine and React HUD) | Tiny, works outside React |
| Asset formats | glTF/GLB + **Meshopt** compression + **KTX2 (Basis)** textures | 5–10× smaller downloads, GPU-compressed |
| Map pipeline | Node script: OpenStreetMap (Overpass export) → roads, building footprints → procedural meshes → chunk GLBs + lane graph + navmesh | Reproducible, scalable to all of Dhaka |
| Backend | Next.js Route Handlers (Node runtime) + Server Actions | One deploy; split later if needed |
| Database | **PostgreSQL (Neon free tier)** + **Drizzle ORM** | Relational fits users/saves/inventory/leaderboards; strong constraints; free. (MongoDB Atlas M0 is a valid alternative — see §7) |
| Auth | **Better Auth** (Google OAuth + email magic link), httpOnly cookies | Modern, self-hosted, DB-backed sessions |
| Cache / rate limit | Upstash Redis (free) + `@upstash/ratelimit` | Serverless-friendly |
| Validation | **zod** schemas in `packages/shared` | Same schema on client & server |
| Hosting | Vercel (site + API), Cloudflare R2 (game assets, free egress) | Free tier start; CDN close to Bangladesh (Singapore/Mumbai PoPs) |
| Testing | Vitest (unit), Playwright (e2e + WebGL smoke), custom perf benchmark scene | |
| CI | GitHub Actions: typecheck, lint, test, asset-size budget check, build | |
| Monitoring | Sentry (free) for JS errors + WebGL context loss; Vercel Analytics | |

## 3. Repository layout

```
I:\Game
├── apps/
│   └── web/                      # Next.js app (site + API + /play page)
│       ├── app/
│       │   ├── (site)/           # landing, news, leaderboards, profile
│       │   ├── play/             # client-only game mount
│       │   ├── admin/            # admin panel (role-guarded)
│       │   └── api/              # route handlers: saves, stats, leaderboard, health
│       ├── server/               # db (drizzle), auth, services, rate-limit
│       └── components/hud/       # React HUD, menus, phone UI
├── packages/
│   ├── engine/                   # THE GAME (framework-agnostic TS)
│   │   ├── core/                 # loop, time, events, ECS-lite, assets, input
│   │   ├── render/               # renderer, post-fx, sky, lighting, LOD, instancing
│   │   ├── physics/              # rapier worker, char controller, vehicles
│   │   ├── world/                # chunk streamer, map data, props, day-night, weather
│   │   ├── actors/               # player, peds, police, gang, animation graph
│   │   ├── vehicles/             # vehicle defs, controllers, damage, traffic AI
│   │   ├── combat/               # weapons, projectiles, melee, damage, explosions
│   │   ├── ai/                   # behaviour trees, perception, navmesh, wanted system
│   │   ├── missions/             # mission runner, triggers, dialogue, cutscenes
│   │   ├── audio/                # spatial audio, radio
│   │   └── save/                 # serialisation, versioning, migration
│   ├── shared/                   # zod schemas, types, constants (shared w/ server)
│   └── content/                  # data: missions JSON, dialogue (bn/en), weapons, vehicles
├── tools/
│   ├── map-builder/              # OSM → chunks, lane graph, navmesh
│   └── asset-pipeline/           # gltf-transform: meshopt, ktx2, LOD, size reports
├── assets-src/                   # source .blend/.fbx/.wav (git LFS)
├── docs/                         # this folder
└── turbo.json, pnpm-workspace.yaml
```

## 4. Game client architecture

### 4.1 Main loop
- `requestAnimationFrame` render loop + **fixed 60 Hz simulation step** (accumulator) for physics/AI; render interpolates.
- Physics runs in a **Web Worker** (Rapier); main thread sends inputs, receives transforms via `SharedArrayBuffer` when cross-origin isolated (COOP/COEP headers on `/play`), else transferable buffers.
- Systems order per tick: Input → Player controller → AI (time-sliced) → Vehicles → Physics step → Combat/damage → Missions/triggers → Wanted system → Audio → Camera → Render.

### 4.2 Entities
ECS-lite: entities are ids; components are typed arrays/maps for hot data (transforms, velocities) and objects for cold data. Pools for bullets, NPCs, vehicles, particles to avoid GC spikes.

### 4.3 World streaming
- Map split into **128 m × 128 m chunks**. Each chunk: merged static mesh (per material), instanced props list, colliders (simplified), lane-graph slice, navmesh tile, spawn points.
- Load radius by quality: Low 2 chunks, High 4 chunks; far ring uses **impostor/low-LOD skyline** for the "big city" look.
- Priority queue loads chunks in movement direction (vehicles look further ahead).
- Everything cached in **IndexedDB/Cache Storage** after first visit → instant second launch.

### 4.4 Rendering & "AAA feel" budget
| Technique | Notes |
|---|---|
| Physically based materials, ACES/AgX tone mapping | Base look |
| Cascaded shadow maps (2–3 cascades) | Off/1 cascade on Low |
| Baked AO in textures + cheap SSAO/GTAO on High | Depth for dense streets |
| Bloom, colour grading LUT ("Golden Dhaka"), vignette, light film grain | The cinematic look |
| Atmospheric fog + humid haze, procedural sky with sun/moon | Day–night |
| Wet-road shader (rain): roughness + puddle mask + screen-space reflections on High | Monsoon |
| GPU instancing for rickshaws, cars, peds (crowd LOD with baked animation textures for far NPCs) | Density without draw-call cost |
| Decals: posters, graffiti, rickshaw art, tyre marks, bullet holes | Detail cheaply |
| Dynamic resolution scaling to hold target FPS | Stability |
| Motion blur (vehicle only, High), camera shake, FOV kick | Speed feel |

### 4.5 Character & animation
- One shared humanoid skeleton (~50 bones); body/outfit modular meshes, ≤ 15k tris hero, ≤ 4k tris crowd NPC.
- Animation state machine: Locomotion blend space (idle→walk→jog→sprint by speed + direction), jump/fall/land, enter/exit vehicle per seat, melee combos, aim offsets (upper-body layer), hit reactions, death → ragdoll-lite (Rapier joints, limited bones).
- Foot IK on slopes/stairs (P1). Animation sources: Quaternius Universal Animation Library (CC0), Mixamo (free for games, not redistributable raw), custom mocap later.

### 4.6 Vehicles
- Rapier `DynamicRayCastVehicleController` with per-vehicle tuning data (mass, suspension, grip curves, torque curve, gear ratios). Two-wheelers use a lean controller with assisted balance. Rickshaw: three-wheel with pedal speed curve.
- Damage: health per part (engine, tyres), vertex-offset dents, smoke/fire states, explosion.

### 4.7 AI
- **Pedestrians:** navmesh agents with simple utility AI (wander, shop, chat, flee, film, fight). Far NPCs simulated cheaply (on rails, no physics).
- **Traffic:** lane graph with Dhaka-style parameters (aggression, gap acceptance, honk rate, jam formation at intersections).
- **Police & gang:** behaviour trees + perception (sight cone, hearing), squad tactics-lite (flank, take cover), pursuit driving on lane graph with "rubber-band" off-road logic.
- AI is **time-sliced** (only N agents think per frame) and LOD'd by distance.

### 4.8 Missions & content
- Missions are **data (JSON validated by zod)** + small script hooks in TS. Objectives: go-to, chase, kill/disable, collect, escort, survive, drive-to, timer, dialogue.
- Dialogue files per language (`bn`, `en`), with subtitles and optional voice files.
- Content is hot-reloadable in dev for fast iteration.

### 4.9 Save system
- Save = versioned JSON (player state, inventory, money, mission progress, world flags), compressed.
- Guest: IndexedDB. Logged-in: synced to server with **optimistic version number** (conflict → pick newer/ask).
- Save schema migrations in `packages/engine/save/migrations`.

### 4.10 Cross-device layer (mobile, tablet, desktop)
Full spec: `06-PLATFORMS-MOBILE.md`.
- `core/platform/`: device & GPU detection, benchmark, preset selection, dynamic resolution controller, thermal watchdog.
- `core/input/`: one **action-based input system** (`move`, `look`, `fire`, `enterVehicle`…) with three backends: keyboard/mouse, touch, gamepad. Game code only reads actions, never raw keys. Backends switch automatically on last-used input.
- `core/gamelock/`: Fullscreen API, `screen.orientation.lock`, Wake Lock, Pointer/Keyboard Lock, history trap for back gesture, gesture/zoom/scroll suppression, visibility pause.
- `ui/touch/`: touch HUD (floating joystick, look zone, context buttons, vehicle layout), HUD editor saved per device in IndexedDB + cloud profile.
- **Quality presets** are data (`content/presets.json`): resolution scale, shadow cascades, post-fx toggles, chunk radius, NPC/traffic density, texture max size, FPS cap.
- **PWA:** `manifest.webmanifest` (fullscreen, landscape), service worker (Workbox-style) caching engine bundle + chunks with versioned cache names.
- Rendering uses **one code path** for all devices; mobile just gets cheaper settings, so features never diverge.

## 5. Backend

### 5.1 API (Route Handlers, all zod-validated)
| Method & path | Purpose | Auth |
|---|---|---|
| `GET /api/health` | Health check | – |
| `GET/PUT /api/saves/:slot` | Read/write cloud save (slot 1–3) | User |
| `POST /api/stats/session` | Session end stats (playtime, kills, distance) | User/guest token |
| `POST /api/leaderboard/:board` | Submit run with event log for validation | User |
| `GET /api/leaderboard/:board` | Top 100 + my rank | – |
| `GET /api/news`, `GET /api/flags` | Website news, remote feature flags | – |
| `/api/auth/*` | Better Auth handlers | – |
| `/api/admin/*` | Users, bans, news, flags | Admin role |

### 5.2 Database schema (PostgreSQL, Drizzle)
```
users            (id uuid pk, email unique, name, avatar, role enum[player,mod,admin], created_at, banned_at)
sessions/accounts/verification   (Better Auth tables)
profiles         (user_id pk fk, display_name unique, level, respect, total_playtime_s, outfit jsonb)
save_slots       (id, user_id fk, slot smallint 1-3, version int, game_version, data bytea/jsonb,
                  checksum, updated_at, UNIQUE(user_id, slot))
player_stats     (user_id pk, kills, chhintai_caught, distance_m, missions_done, longest_escape_s, ...)
mission_progress (user_id, mission_id, status, best_time_ms, completed_at, PK(user_id, mission_id))
inventory_items  (user_id, item_id, qty, meta jsonb, PK(user_id,item_id))   -- mirror for anti-cheat stats
vehicles_owned   (id, user_id, vehicle_def_id, colour, mods jsonb, garage_slot)
leaderboard_entries (id, board, user_id, score, run_hash, validated bool, created_at, INDEX(board, score))
achievements     (user_id, achievement_id, unlocked_at)
news_posts       (id, slug, title_bn, title_en, body, published_at)
feature_flags    (key pk, value jsonb, updated_at)
audit_log        (id, actor_id, action, target, meta jsonb, created_at)
```
Free tier fit: saves are ~5–30 KB compressed → 0.5 GB Neon holds ~20k+ active players' saves; move to paid when we grow.

## 6. Security

| Threat | Mitigation |
|---|---|
| Account takeover | Better Auth, OAuth, httpOnly + Secure + SameSite cookies, CSRF protection on mutations, session rotation |
| Injection | Drizzle parameterised queries only; zod validation on every input; size limits (save ≤ 256 KB) |
| API abuse / DoS | Upstash rate limits per IP + per user; Vercel firewall/bot protection; request body limits |
| Leaderboard cheating | Client cannot be trusted → server sanity checks (min possible time, event-log replay checks, signed run tokens issued at run start, anomaly flags), shadow-ban instead of instant ban |
| Save tampering | Checksums detect corruption only (client can always edit its own single-player save — acceptable); leaderboards/achievements never trust save data alone |
| XSS | React escaping, strict **CSP** with nonces, no `dangerouslySetInnerHTML` for user content, sanitised display names (profanity filter) |
| Secrets leakage | Only `NEXT_PUBLIC_*` reaches client; secrets in Vercel env; `.env*` git-ignored; secret scanning in CI |
| Admin misuse | Role check in server, audit log, 2FA for admins |
| Supply chain | Lockfile, `pnpm audit`, Renovate/Dependabot, pinned versions |
| Privacy | Minimal PII (email only), privacy policy, account deletion endpoint |
| Headers | HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy; COOP/COEP on `/play` for SharedArrayBuffer |

## 7. Database choice: PostgreSQL vs MongoDB Atlas

| | PostgreSQL (Neon free) | MongoDB Atlas M0 |
|---|---|---|
| Free storage | 0.5 GB / project, autoscaling compute, scales to zero | 512 MB shared cluster |
| Fit for this game | Users, saves, leaderboards, inventory = relational with constraints, ranking queries are easy | Flexible JSON saves, fine too |
| Integrity | Foreign keys, unique constraints, transactions | Weaker by default |
| Leaderboard queries | Window functions (`RANK()`), indexes | Aggregation pipeline |
| Recommendation | ✅ **Chosen** — JSONB gives Mongo-style flexibility for the save blob anyway | Alternative if you prefer |

## 8. Performance budgets (enforced in CI)
| Asset | Budget |
|---|---|
| Engine JS (gzipped) | ≤ 900 KB |
| Rapier WASM | ~1.5 MB |
| Hero character GLB | ≤ 2 MB (≤ 1 MB mobile variant) |
| Average map chunk | ≤ 1.5 MB (≤ 700 KB mobile textures) |
| Each vehicle | ≤ 600 KB |
| First playable total | ≤ 15 MB mobile / ≤ 25 MB desktop |
| Mobile frame budget | 33 ms at 30 FPS on a Helio G99 test phone |

## 9. Future: multiplayer (Phase 9+)
Separate Node service with **Colyseus** (authoritative rooms, 16–32 players free roam), hosted on Fly.io/Render (WebSockets need a persistent server — not Vercel functions). Engine already separates *simulation* from *rendering* and uses data-driven state, so networking can be added without rewrite.
