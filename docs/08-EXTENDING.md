# How to Extend & Improve the Game Later

Goal: any feature can be improved, replaced or added **at any time** without rewriting the game. The game is built as modules plus data.

## 1. Principles
1. **Data-driven content.** Missions, vehicles, weapons, NPC types, shops, dialogue, radio, quality presets, map zones are JSON/TS data files in `packages/content`, validated by zod schemas in `packages/shared`. Changing a gun's damage or adding a new vehicle = edit data, no engine change.
2. **Feature modules.** Each system (vehicles, combat, police, missions, weather, phone…) is a self-contained module in `packages/engine/<system>` with a small public API, registered in one place (`engine/core/registry.ts`). A module can be swapped or upgraded alone.
3. **Feature flags.** New or experimental features ship behind flags (`content/flags.json` + remote flags from the admin panel), so they can be tested, turned off, or rolled out gradually.
4. **Versioned saves.** Every save has a `saveVersion`; when the data shape changes, add a migration in `engine/save/migrations/`. Old saves never break.
5. **Map zones as packs.** Each area (Mohammadpur, Dhanmondi, Cox's Bazar…) is a separate zone pack built by `tools/map-builder`, loaded on demand. Adding a district doesn't touch existing zones.
6. **Docs stay alive.** `docs/07-FEATURE-CHECKLIST.md` is the living backlog. Add ideas there anytime; tag with a phase or "Later".

## 2. Recipes

| I want to… | Do this |
|---|---|
| Add a vehicle | Model → `tools/asset-pipeline` → add entry in `content/vehicles/*.json` (handling, seats, sounds, price) → it appears in traffic/shops |
| Tune a weapon | Edit `content/weapons/*.json` (damage, recoil, fire rate, ammo, price) |
| Add a mission | New file in `content/missions/` (objectives, triggers, dialogue ids) + dialogue in `content/dialogue/bn|en/` + optional script hook |
| Add a side activity | New module under `engine/activities/` implementing the `Activity` interface + data file |
| Add a new area/district | Add OSM bounding box + landmark overrides in `tools/map-builder/zones/<zone>.json` → build → upload chunks → register zone |
| Add a character | Outfit/mesh parts + `content/characters/*.json` (name, voice set, behaviour profile) |
| Change graphics quality | Edit `content/presets.json` (per preset: resolution, shadows, density, post-fx) |
| Change touch layout defaults | `content/ui/touch-layouts.json` |
| Add a radio station / ad | `content/radio/*.json` + audio files on CDN |
| Add a language | `content/i18n/<lang>.json` + dialogue folder |
| Turn a feature on/off live | Admin panel → Feature flags |

## 3. Upgrading tech later
- **Renderer:** all rendering goes through `engine/render`, so we can move from WebGL2 to WebGPU-only effects (better lighting, GI) without touching gameplay.
- **Physics:** wrapped behind `engine/physics` interfaces; Rapier can be upgraded or replaced.
- **Backend:** API contracts live in `packages/shared` (zod). The server can move from Next.js route handlers to a separate service without changing the client.
- **Multiplayer:** simulation is separated from rendering and state is serialisable, so a Colyseus server can be added later (Phase 9+).

## 4. Process for any improvement
1. Add/update the item in `docs/07-FEATURE-CHECKLIST.md`.
2. Implement behind a flag if risky.
3. Test on phone + desktop.
4. Update `PROGRESS.md` and commit.
