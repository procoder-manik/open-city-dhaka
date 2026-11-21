# Roadmap & Phase Plan

Each phase ends with a **playable build** you can open in the browser and test. We build one phase at a time; you approve before the next starts.

```
P0 Foundation ─► P1 "Feel" slice ─► P2 Mohammadpur map ─► P3 Vehicles & city life
   ─► P4 Combat & police ─► P5 Missions Act 1 ─► P6 Backend & accounts
   ─► P7 Polish (audio, weather, phone, perf, mobile) ─► P8 Launch ─► P9+ Expansion
```

---

## Phase 0 — Foundation
**Goal:** project skeleton that builds, deploys and shows a 3D scene.
- pnpm + Turborepo monorepo (`apps/web`, `packages/engine`, `packages/shared`, `packages/content`, `tools/*`)
- Next.js 16 app: landing page placeholder, `/play` client-only route, security headers, COOP/COEP on `/play`
- Engine bootstrap: renderer (WebGPU→WebGL2 fallback), fixed-step loop, action-based input (keyboard + touch + gamepad), asset loader (GLTF + Meshopt + KTX2), debug panel (FPS, draw calls, memory)
- **Cross-device base:** device/GPU detection + quality presets, Game Lock (fullscreen, landscape lock, no zoom/scroll, back-gesture trap, wake lock), PWA manifest + service worker, responsive layout
- Rapier worker + test ground + cube
- Asset pipeline script (gltf-transform) + size-budget check
- ESLint, Prettier, Vitest, Playwright smoke test, GitHub Actions CI
- `.env.example`, README with run instructions

**Done when:** `pnpm dev` → open `/play` on a PC **and on a phone** → lit scene with a physics cube; the phone goes landscape full screen, can't be zoomed/scrolled or swiped out; CI green.

## Phase 1 — "Feel" vertical slice (the most important phase)
**Goal:** one Mohammadpur street block that already *feels* like an AAA-inspired open-world game.
- Hero character (Mostofa) with full locomotion: idle/walk/jog/sprint/jump/fall/land, turn-in-place, blending
- Third-person camera: collision, smoothing, sprint FOV, shake, aim mode
- One drivable car + one motorbike + CNG with tuned physics; enter/exit animations
- One hand-crafted street (Tajmahal Road block): buildings, shops, signboards, wires, tea stall
- Lighting & post: sky, sun, shadows, tone mapping, bloom, colour grade, fog; quick day-night
- Basic HUD (health, minimap placeholder), pause menu, graphics presets
- **Touch controls v1** (floating joystick, look drag, jump/sprint/enter buttons, vehicle layout) + gamepad

**Done when:** a 5-minute playtest of walking + driving feels smooth and "cinematic" **on PC and on a mid Android phone (30 FPS)**. You sign off on the look & feel before we scale.

## Phase 1.5 — Life, sound & realism upgrade (owner feedback)
**Part A (no external assets, built now):**
- Hero redesigned as a smart young mastan (jeans, shirt, sneakers, sunglasses, chain, beard) with an expressive face (blink, brows, mouth, emotions, talking)
- Synthesized sound: engines per vehicle, horns, skids, crashes, footsteps, city ambience; volume/mute
- Dialogue system (data JSON, subtitles, emotions), NPCs at the tea stall/shops/rickshaw, talk menu: greet / threaten / snatch / order / grab food; Taka counter
- Funny posters & banners on walls and poles
- Vehicle dashboard: fuel gauge + per-zone damage %, smoke when damaged, dust & exhaust particles, smog

**Part B (needs assets — owner decision in `11-ART-REALISM.md`):**
- Realistic skinned characters (MakeHuman + Mixamo), facial blendshapes + lip sync
- Realistic vehicle models with parody brands, deformable panels
- Recorded Bangla voices (actors) or TTS

## Phase 2 — Mohammadpur map
- `tools/map-builder`: OSM export of Mohammadpur → road meshes (with lanes, footpaths, medians), building footprints → procedural buildings (Dhaka style: 4–10 floors, balconies, grills, water tanks, signboards), parks, water (Beribadh)
- Chunking (128 m), streaming, LOD, far skyline impostors, IndexedDB caching
- Hand-made landmark models: Asad Gate, Town Hall bazar, Thana, Krishi Market, Bus Stand, Shia Mosque (exterior), Japan Garden City towers, Beribadh haat
- Lane graph + navmesh generation, street names, minimap & full map from the same data
- Props: rickshaw stands, tea stalls, electric poles with wires, banners, garbage piles, potholes

**Done when:** you can drive across all of Mohammadpur without loading screens at target FPS.

## Phase 3 — Vehicles & city life
- All vehicle types (rickshaw, CNG, bikes, cars, bus, microbus, truck, police, ambulance), damage & explosions
- Carjacking (pull-out animations per vehicle type), passengers
- Traffic AI (Dhaka-style), jams, honking, intersections
- Pedestrians: 10+ archetypes, routines, reactions, crowd LOD
- Radio stub; horn/bell; vehicle sounds

**Done when:** streets are alive and chaotic; you can steal and drive anything.

## Phase 4 — Combat, weapons & police
- Melee system (combos, block, dodge, improvised weapons)
- Guns (pistol, revolver, SMG, shotgun, rifle), aiming, recoil, reload, weapon wheel, ammo
- Grenades, smoke, tear gas, fire bottle; explosions with physics impulse
- Health/armour, hit reactions, ragdoll-lite, death → hospital respawn, arrest → Thana respawn
- Thana Alert 1–5 police system, pursuit AI, roadblocks, helicopter, bribe mechanic
- Gang AI; Ostad's Armoury shop

**Done when:** a free-roam rampage → 5-alert escape is fun and readable.

## Phase 5 — Missions & story (Act 1)
- Mission framework (data-driven), triggers, objectives, fail/retry checkpoints
- In-engine cutscene system (camera tracks, dialogue, subtitles bn/en)
- Act 1: 10 story missions (see GDD §2)
- Side activities: Chhintai Hunter, Khabar Dao delivery, Street Race, Rickshaw Ride, Traffic Volunteer
- Money, Respect levels, unlocks, safehouse (save point)

**Done when:** Act 1 is completable start to finish (~2–3 hours of play).

## Phase 6 — Backend, accounts & online
- PostgreSQL (Neon) + Drizzle schema & migrations
- Better Auth (Google + email), guest → account upgrade, profile
- Cloud saves (3 slots, versioned, conflict handling), autosave sync
- Stats, leaderboards with server validation, achievements
- Rate limiting, CSP, audit log, admin panel (users, bans, news, flags), account deletion

**Done when:** you can log in on another computer and continue your save; leaderboards work and reject obviously cheated runs.

## Phase 7 — Polish
- Audio: full spatial mix, radio stations, voice barks, music cues
- Weather: monsoon rain + waterlogging, fog, load-shedding blackout events _(rain, thunder, wet roads done 2026-11-21; waterlogging gameplay + blackouts later)_
- In-game phone (map, contacts, missions, camera/selfie, "FaceBoi" feed)
- Outfits & customisation shop, garage
- Touch HUD editor polish, gyro aim, haptics, auto-fire, portrait mode _(HUD editor: move + resize groups done 2026-11-21)_
- Performance pass on the full device matrix: dynamic resolution, memory, Lite preset, battery saver, low-data mode, loading time
- Accessibility & settings polish, Bangla font rendering

## Phase 8 — Launch
- Website: landing page with trailer, screenshots, news, credits (OSM + asset licences), privacy policy, terms
- SEO, Open Graph images, analytics, Sentry
- Closed beta (friends), bug-bash, balance pass, open beta, public launch
- Domain + production deploy (Vercel + R2), backups

## Phase 9+ — Expansion
- Dhanmondi / Farmgate (Act 2), Old Dhaka (Act 3), Gulshan–Banani, Cox's Bazar & St. Martin's, then districts
- Real-time multiplayer free roam (Colyseus)
- Seasonal events: Eid haat, Pohela Boishakh, Shakrain, monsoon, Victory Day (respectful)

---

## Rule for every phase
Mobile is not a later phase. Every feature ships with its **touch control + mobile preset** and is tested on phone, tablet and PC before the phase is called done (device matrix in `06-PLATFORMS-MOBILE.md §4`).

## How we will work
1. You say **"Phase X start"** → I build it in small, testable steps, running and checking it in the browser.
2. End of each phase: I show you what works, what's left, and known issues.
3. You give feedback → fixes → next phase.

## Decisions needed from you
1. **Real people:** I recommend original parody characters instead of real influencers/politicians/July fighters (legal & takedown risk). OK? (GDD §4)
2. **Database:** PostgreSQL (Neon, recommended) or MongoDB Atlas?
3. ~~Game name~~: working title **GTM: Great Thief Mostofa** set in `brand.config.json` (changeable later).
4. **Assets budget:** free CC0 only (Quaternius, Kenney, Poly Haven, Mixamo) to start — OK? Later you may want to hire a 3D artist for hero characters & landmarks.
5. **The reference image** you mentioned didn't come through — please attach it again if you want me to use it.
6. **Monetisation:** free for now? (affects hosting plan — Vercel Hobby is non-commercial)
7. **GitHub repo:** create one so CI and deploys can be set up in Phase 0.
