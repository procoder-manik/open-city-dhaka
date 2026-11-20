# Product Requirements Document — GTM: Great Thief Mostofa *(working title, changeable)*

> Name is configured in `/brand.config.json` (see §11 and `docs/09-BRANDING.md`).
> Must NOT be exactly "GTA" or contain "Grand Theft Auto", and the logo must not copy Rockstar's font/style.

| Field | Value |
|---|---|
| Version | 0.1 (planning) |
| Date | 2026-11-20 |
| Platform | Web browser on **every device**: mobile, tablet, laptop, desktop. Installable as a PWA. See `06-PLATFORMS-MOBILE.md` |
| Stack | Next.js + Node.js + Three.js (WebGPU/WebGL2) + Rapier physics + PostgreSQL |
| Genre | Open-world action / crime-comedy, third-person |
| Inspiration | The open-world crime genre (GTA V / VI style gameplay loop) — **inspired by, not a clone** |
| First map | Mohammadpur, Dhaka |

---

## 1. Vision

A **free-to-play, browser-based, open-world action comedy set in Dhaka**. You open a link, and within ~20 seconds you are standing on a Mohammadpur street at golden hour: rickshaw bells, CNG horns, a tea stall, a mugger snatching a phone across the road. You can chase him on foot, jack a motorbike, drive through Town Hall bazar, fight, shoot, throw grenades, escape the police — and laugh the whole time, because every character, sign and radio ad is pure Dhaka satire.

**One-line pitch:** *"The open-world crime game Bangladesh never got — in your browser, no download."*

## 2. Goals

| # | Goal | Measure of success |
|---|---|---|
| G1 | **Feels AAA-inspired** in movement, driving, camera and combat | Playtesters rate "feel" ≥ 4/5 |
| G2 | **Lightweight & runs everywhere**: phone, tablet, laptop, desktop | Playable in ≤ 15 MB (mobile) / ≤ 25 MB (desktop); 60 FPS desktop & normal laptops, stable 30 FPS on mid phones (iPhone 11+, Helio G99) |
| G2b | **Mobile feels native**: landscape full screen like PUBG/Free Fire, "Game Lock" so touches never exit the game | Accidental-exit rate ≈ 0; touch controls rated ≥ 4/5 |
| G3 | **Deeply Bangladeshi & funny** | Recognisable landmarks, Banglish dialogue, shareable moments |
| G4 | **Expandable** — Mohammadpur → all of Dhaka → Cox's Bazar / St. Martin's → 64 districts | Map tooling turns new OpenStreetMap areas into playable zones in days, not months |
| G5 | **Secure & fair** online features | Server-validated progress, rate-limited APIs, no plain secrets in client |

### Non-goals (for v1)
- Photorealism equal to a $200M console game (impossible in a browser download budget — see `05-RESEARCH.md`).
- Real-time multiplayer (planned for a later phase; architecture keeps the door open).
- Real-money purchases (later decision).
- Real, living people or real political parties as characters (see §9).

## 3. Target audience

- **Primary:** Bangladeshi gamers 14–35, **mostly on Android phones**, plus laptops/desktops; often mid/low-end hardware and costly mobile data.
- **Secondary:** Bangladeshi diaspora; international players curious about Dhaka.
- **Language:** Bangla + Banglish UI and dialogue, English toggle.
- **Age rating target:** Teen/16+ (cartoon-ish violence, no gore, no sexual content).

## 4. Core gameplay loop

```
Explore Mohammadpur ──► spot event (mugging, mission marker, race, delivery)
        ▲                          │
        │                          ▼
  spend Taka on weapons,    act: chase / fight / drive / shoot
  vehicles, outfits                │
        ▲                          ▼
        └──── earn Taka + Respect ◄── escape police "Thana Alert" or win
```

## 5. Feature requirements

Priority: **P0** = must have for first public release, **P1** = should have, **P2** = later.

### 5.1 Player & movement
| ID | Requirement | P |
|---|---|---|
| PL-1 | Third-person character: walk, jog, sprint, crouch, jump, fall, land, turn-in-place | P0 |
| PL-2 | Smooth animation blending (locomotion blend space), no foot sliding beyond tolerance | P0 |
| PL-3 | Over-the-shoulder camera with collision, aim zoom, sprint FOV kick, camera shake | P0 |
| PL-4 | Health, armour, stamina; ragdoll-lite on death/knockdown | P0 |
| PL-5 | Climb low walls/vault fences; swim in Beribadh/Turag area water | P1 |
| PL-6 | Character customisation: outfits (lungi, panjabi, jersey, jacket), hair, sunglasses | P1 |
| PL-7 | Dual protagonists with switch (story-driven) | P2 |

### 5.2 Vehicles
| ID | Requirement | P |
|---|---|---|
| VH-1 | Enter/exit any vehicle; **carjack** occupied vehicles (pull driver out) | P0 |
| VH-2 | Vehicle types: rickshaw (pedal), CNG auto-rickshaw, motorbike, private car, police pickup, local bus, microbus, truck, bicycle | P0 (rickshaw, CNG, bike, car, police) / P1 rest |
| VH-3 | Arcade-realistic physics: suspension, drift, handbrake, damage, flip & respawn | P0 |
| VH-4 | Vehicle damage (deformation-lite, smoke, fire, explosion) | P1 |
| VH-5 | Radio while driving (original stations, see GDD) | P1 |
| VH-6 | Garage to save owned vehicles | P1 |
| VH-7 | Boats on Buriganga/Turag (later maps) | P2 |

### 5.3 Combat & weapons
| ID | Requirement | P |
|---|---|---|
| CB-1 | Melee: punch combos, kick, block, dodge; improvised weapons (bamboo lathi, cricket bat, brick) | P0 |
| CB-2 | Firearms: pistol, revolver, SMG, shotgun, assault rifle, sniper | P0 (pistol, SMG, shotgun) / P1 rest |
| CB-3 | Throwables: grenade, smoke bomb, "cocktail" (molotov-style), tear gas | P0 (grenade) / P1 |
| CB-4 | Weapon wheel, ammo, reload, recoil, hit markers, headshots, soft lock-on + free aim | P0 |
| CB-5 | Buy weapons/ammo at a hidden "Ostad's Armoury" shop | P0 |
| CB-6 | Cover system (snap to wall) | P1 |
| CB-7 | No gore; stylised hit effects | P0 |

### 5.4 World & AI
| ID | Requirement | P |
|---|---|---|
| WD-1 | Mohammadpur map built from OpenStreetMap street layout with hand-made landmarks | P0 |
| WD-2 | Pedestrians with daily routines, reactions (flee, film you on phone, cheer, fight back) | P0 |
| WD-3 | Traffic AI following lanes loosely (Dhaka-style: honking, lane-squeezing, jams) | P0 |
| WD-4 | Police "Thana Alert" heat system 1–5 (whistle → patrol bikes → pickups → RAB-style special unit → roadblocks + helicopter) | P0 |
| WD-5 | Day–night cycle (1 game day = 48 real minutes), lighting presets | P0 |
| WD-6 | Weather: clear, monsoon rain + waterlogging, fog, load-shedding blackout event | P1 |
| WD-7 | Random street events: mugging, cow escaped from haat, wedding procession, traffic fight, VIP motorcade | P0 (mugging) / P1 rest |

### 5.5 Missions & progression
| ID | Requirement | P |
|---|---|---|
| MS-1 | Data-driven mission system (objectives, triggers, cutscenes, dialogue, fail states) | P0 |
| MS-2 | Story Act 1 — "Mohammadpur Arc" (~10 missions) | P0 |
| MS-3 | Side activities: Chhintai Hunter, delivery, street race, rickshaw taxi, bounty, collectibles | P0 (2 types) / P1 rest |
| MS-4 | Money (Taka), Respect (XP/levels), stats | P0 |
| MS-5 | In-game phone: map, missions, contacts, camera/selfie, "FaceBoi" social feed parody | P1 |
| MS-6 | Achievements | P1 |

### 5.6 UI / HUD
| ID | Requirement | P |
|---|---|---|
| UI-1 | Original HUD: circular minimap with GPS route, health/armour, weapon, money, Thana Alert | P0 |
| UI-2 | Full-screen pause map with waypoints | P0 |
| UI-3 | Settings: graphics preset (Low/Med/High/Ultra), resolution scale, FOV, controls rebinding, audio, language | P0 |
| UI-4 | Gamepad support (all devices) | P1 |
| UI-5 | Mobile/tablet touch controls: floating joystick, drag-to-look, context buttons, separate vehicle layout | **P0** |
| UI-6b | HUD layout editor (move/resize/opacity, 3 layouts, lock layout) | P0 |
| UI-7 | Responsive HUD & menus for phone (portrait + landscape), tablet, desktop; safe-area aware | P0 |

### 5.6b Platform & mobile (full spec in `06-PLATFORMS-MOBILE.md`)
| ID | Requirement | P |
|---|---|---|
| MB-1 | Landscape full screen default; optional portrait mode | P0 |
| MB-2 | **Game Lock**: fullscreen, orientation lock, no zoom/scroll/pull-to-refresh/long-press, back gesture opens pause instead of leaving, screen stays awake | P0 |
| MB-3 | Installable PWA (home-screen icon, full screen on iPhone, offline cache of downloaded content) | P0 |
| MB-4 | Auto quality detection + presets Lite / Mobile / Medium / High / Ultra, dynamic resolution | P0 |
| MB-5 | Aim assist, gyro aim (optional), auto-fire option, haptics | P1 |
| MB-6 | Battery saver & low-data mode | P1 |
| MB-7 | Input auto-switch: touch ↔ keyboard/mouse ↔ gamepad | P1 |
| UI-6 | Website: landing page, trailer, login, profile, leaderboards, news | P0 |

### 5.7 Online & backend
| ID | Requirement | P |
|---|---|---|
| BE-1 | Play as guest instantly (local save); optional account (Google / email) for cloud save | P0 |
| BE-2 | Cloud save slots (3 per user) with version + checksum | P0 |
| BE-3 | Leaderboards (race times, chhintai caught, longest escape) — server-validated | P1 |
| BE-4 | Player profile & stats | P1 |
| BE-5 | Admin panel: users, bans, feature flags, news posts | P1 |
| BE-6 | Real-time multiplayer free roam | P2 |

### 5.8 Audio
| ID | Requirement | P |
|---|---|---|
| AU-1 | Spatial 3D audio (engines, horns, rickshaw bells, crowds, azaan-time ambience handled respectfully) | P0 |
| AU-2 | Original/royalty-free radio stations with parody DJ talk and fake ads | P1 |
| AU-3 | Voice barks in Bangla (pedestrians, police, gang) | P1 |

## 6. Performance & technical requirements

| Metric | Target |
|---|---|
| Initial download (to playable) | ≤ 15 MB mobile / ≤ 25 MB desktop (brotli), rest streamed |
| Time to playable | ≤ 20 s on 20 Mbps; ≤ 3 s on second launch (cached) |
| Frame rate | 60 FPS desktop/laptop, 30 FPS stable on mid & low phones |
| Draw calls | ≤ 500 desktop, ≤ 150 mobile per frame |
| Memory | ≤ 1.5 GB desktop High, ≤ 600 MB mobile |
| Browsers | Chrome/Edge 120+, Firefox 130+, Safari 18+ (iOS & macOS), Samsung Internet; WebGPU where available, WebGL2 fallback |
| Save reliability | No progress loss on tab close (autosave every 60 s + on mission end) |

## 7. Monetisation (decision later)
Options to evaluate in Phase 8: free with non-intrusive ads on website (not inside gameplay), cosmetic store, supporter pack, sponsorships from local brands (as parody-safe in-world billboards). **Hosting note:** Vercel Hobby plan is non-commercial — if the game earns money, move to Vercel Pro or Cloudflare.

## 8. Success metrics (post-launch)
- D1 retention ≥ 30 %, D7 ≥ 10 %
- Median session ≥ 15 min
- Crash/WebGL context-loss rate < 1 % of sessions
- Shares/clips on Facebook/TikTok/YouTube

## 9. Content & legal policy (important)
1. **Inspired, not cloned.** No GTA names, logos, fonts, map, characters, music, UI art, or its signature loading-screen painting style. Our HUD, logo and art direction are original.
2. **No real living people as named or recognisable characters** (influencers, politicians, actors, July-movement participants). We use **original parody archetypes** instead (e.g. a fictional over-the-top vlogger, a fictional film hero). Reason: defamation and personality-rights risk, Bangladesh cyber laws, takedown/ban risk for the website, and platform (ads/Facebook) policy. See `04-GAME-DESIGN.md §4`.
3. **No real political parties.** Rally missions use fictional parties with silly names; satire targets behaviours (goondami, ghush, VIP culture), not real groups.
4. **July 2024 movement** is treated respectfully — never made into a joke or a combat target. A positive nod is fine (student volunteers managing traffic).
5. **Religious sites** (mosques incl. Mohammadpur Shia Masjid area) and memorials (Rayer Bazar Boddhobhumi) are non-combat zones.
6. **Map data:** OpenStreetMap (ODbL) — attribution "© OpenStreetMap contributors" on credits page.
7. **Assets:** only CC0 / properly licensed / self-made models, animations, sounds, music, fonts.

## 10. Open questions for the owner
See `03-ROADMAP.md → "Decisions needed from you"`.

## 11. Name & branding
Working title: **GTM: Great Thief Mostofa**, tagline *"Bangladesh's Most Wanted"*. Hero = **Mostofa**. The name follows the hero, so it fits every area of Bangladesh (editions: GTM: Mohammadpur → GTM: Dhaka → GTM: Cox's Bazar).
Not final. The name lives only in `/brand.config.json` and can be changed anytime without code changes. Candidates, rules and rename checklist: `docs/09-BRANDING.md`.
