# Research, Analysis & Risks

## 1. Reality check: "GTA VI graphics in a browser"
A console AAA game ships 100+ GB of assets and uses ~16 GB of RAM on dedicated hardware. A browser game that loads in seconds has a budget of tens of MB and must run on integrated GPUs. So we **cannot match GTA VI's photorealism**, and no browser game can. What we *can* match is the **feel**:

| What makes it "feel AAA" | How we get it cheaply |
|---|---|
| Responsive, weighty movement | Good animation blending, camera work, acceleration curves |
| Satisfying driving | Tuned suspension, drift, sound, camera lag, motion blur |
| Living city | Density through instancing + crowd LOD, reactive NPCs, barks |
| Cinematic lighting | Golden-hour grade, bloom, fog, sky, wet roads |
| Detail everywhere | Decals, clutter props, signboards, wires (cheap but dense) |
| Humour & personality | Writing, radio, characters — costs nothing in MB |

Visual target: **stylised-realistic**, roughly "good indie open-world on PC" — and on High settings with WebGPU, better than that.

## 2. Competitive / reference analysis
| Reference | What to learn | What we do better |
|---|---|---|
| **Baper Rasta** (baperrasta.com) — Bangladeshi rickshaw/CNG driving browser game | Shows demand for Dhaka-set web games; local humour works | Full open world: on-foot, carjacking any vehicle, combat, guns, police, missions, story |
| GTA V / VI (genre reference only) | Core loop, wanted system clarity, mission pacing, radio satire | Local setting & humour; instant browser access |
| Browser 3D games (e.g. Slow Roads, Venge.io, Krunker) | Proof that three.js/WebGL can deliver smooth 60 FPS gameplay | Larger scope, story |
| Indie open-world (e.g. Sleeping Dogs-style melee, Saints Row humour) | Melee flow, comedic tone | — |

## 3. Technology research summary
- **three.js WebGPURenderer**: falls back to WebGL2 automatically; TSL lets us write shaders once for both. WebGPU is available in Chrome/Edge, Safari 26+, and Firefox (Windows) — WebGL2 covers everyone else.
- **Rapier** offers a kinematic character controller and a raycast vehicle controller out of the box → saves months.
- **Meshopt + KTX2** typically cut model/texture download 5–10× and GPU memory by ~4×.
- **OpenStreetMap** has good coverage of Mohammadpur roads and many building footprints; heights are mostly missing → procedural heights (4–10 floors) with landmark overrides.
- **Free asset sources (CC0 / free-for-games):** Quaternius (characters, animations, vehicles), Kenney (props), Poly Haven (HDRIs, textures), ambientCG (textures), Mixamo (animations — free in games, can't redistribute raw files), Freesound (check per-file licence), Google Fonts (Hind Siliguri, Noto Sans Bengali, Tiro Bangla).
- Bangladeshi-specific assets (rickshaw, CNG, bus, tea stall, signboards) **don't exist as free models** → we model them low-poly ourselves (procedural + Blender) — this is part of our unique look.

## 4. Risks & mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Scope too big ("everything GTA has") | Never ships | Strict phases, vertical slice first, P0/P1/P2 priorities |
| Performance on low-end laptops | Players leave | Quality presets, dynamic resolution, budgets in CI, test on Iris Xe early |
| Art quality inconsistent (mixed free assets) | Looks cheap | Unified art direction, colour grade, material library, re-texture assets |
| Legal: real people / parties | Defamation claims, takedown, cyber-law cases | Original parody archetypes, fictional parties (PRD §9) |
| Legal: looking like a GTA clone | Trademark/copyright notice | Original name, logo, HUD, map, characters; "inspired by genre" only |
| Sensitive places/events | Public backlash | Non-combat zones for mosques & memorials; respectful July 2024 nod |
| Free tiers limits (DB, hosting) | Outage at growth | Assets on R2 (free egress), monitor usage, upgrade path documented |
| Cheating on leaderboards | Unfair boards | Server validation, run tokens, anomaly detection |
| Browser memory crashes / WebGL context loss | Lost progress | Autosave, context-restore handling, memory budgets |

## 5. Estimated effort (one developer + AI pair)
| Phase | Rough size |
|---|---|
| P0 Foundation | small |
| P1 Feel slice | large (most iteration) |
| P2 Map | large |
| P3 Vehicles & life | large |
| P4 Combat & police | large |
| P5 Missions Act 1 | large |
| P6 Backend | medium |
| P7 Polish | large |
| P8 Launch | medium |

Calendar time depends on your review speed and how much custom art we make; Phase 0–1 is the fastest way to see whether the look and feel is right.
