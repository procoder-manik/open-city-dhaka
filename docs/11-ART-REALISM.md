# Art Direction & Realism Plan

Owner requirement: **not cartoonish**. Natural, realistic colours and look in the spirit of modern AAA open-world games, human-like characters with facial expressions, realistic cars, while staying fast in a browser and on phones.

## 1. Honest limits
- A browser game must download in seconds and run on phones, so we use **game-optimised realistic assets** (10–25k triangle characters, 1–2K textures), not film-quality ones. Done well, this looks like a good modern PC/console open-world game at medium settings.
- **Realistic humans and cars cannot be made from code-generated shapes** (what Phase 1 uses as placeholders). They need proper 3D models, made in tools like Blender/MakeHuman or bought/commissioned. This is the main dependency for "realistic".

## 2. Characters
| Need | Approach |
|---|---|
| Human-like body & face | **MakeHuman** (free, output is CC0) for base bodies with Bangladeshi features & skin tones → Blender for outfits/hair → glTF |
| Animations | **Mixamo** (free for games) or motion capture; one shared skeleton; retargeted walk/run/jump/punch/aim/drive/sit/talk |
| Facial expressions | Morph targets (blendshapes): blink, smile, angry, surprised, sad + **visemes** for lip sync (A/E/I/O/U/M/F) |
| Lip sync | Visemes timed from audio (or text when no audio) |
| Eyes | Random natural blinks, eyes look at speaker/player |
| Variety | Modular outfits & heads: rickshaw-wala, office man, aunty in sari/salwar, students, police, hawkers, foreigners, gangsters |
| Hero (Mostofa) | **Smart young mastan**: fitted jeans, printed/open shirt over tee, sneakers, sunglasses, gold chain, styled hair, trimmed beard, swagger walk. Lungi as an unlockable outfit |

Until real models arrive, the procedural hero has eyes that blink, brows and a mouth that show emotions and move when talking, and the new mastan outfit.

## 3. Vehicles
- Realistic proportions & materials (PBR paint with clear-coat, glass, chrome, rubber), detailed wheels, lights that glow, interior silhouette.
- **No real brand names or logos** (trademark). Designs are *inspired by* common Dhaka vehicles with original parody names, as GTA does:

| Real-world type | In-game (original name) |
|---|---|
| Japanese compact sedan (very common in Dhaka) | **"Korim Corolla"**-style → name: *Shohor Sedan* |
| German luxury sedan | *Nawab 500* |
| Japanese SUV / Prado-type | *Boss Cruiser* |
| Indian hatchback / Tata-type | *Bhai Nano* |
| CNG auto-rickshaw | *Sabuj CNG* |
| 150cc commuter bike | *Pulsar*-like → *Hawa 150* |
| Local bus | *Dhaka Lokal* |
| Truck | *Bhai Bhai Transport* |

- Damage: deformable panels (vertex offsets), broken glass, dents, smoke → fire → explosion; per-zone damage shown in HUD.

## 4. World look ("natural Dhaka")
- Physically based materials, ACES/AgX tone mapping, warm humid haze, **air-pollution smog** layer (brownish horizon by day), dust kicked up by vehicles, exhaust smoke, monsoon wet roads.
- Texture-rich surfaces: stained plaster, rust, peeling paint, posters, rickshaw art, tangled wires.
- Funny **posters & banners** everywhere (all original): "এখানে প্রস্রাব করা নিষেধ", "জিন-পরী তাড়ানো হয়", "ভাইয়ের আগমনে শুভেচ্ছা", "হারানো বিজ্ঞপ্তি", "বাসা ভাড়া — ব্যাচেলর নিষেধ"… (`world/posters.ts`, data-driven).

## 5. Asset pipeline & budgets
| Asset | Triangles | Textures | Size (glTF + Meshopt + KTX2) |
|---|---|---|---|
| Hero | 20–25k | 2K body, 1K face | ≤ 2 MB |
| NPC | 8–12k (LOD 3k) | 1K | ≤ 800 KB |
| Car | 25–40k (LOD 6k) | 2K | ≤ 1.2 MB |
| Bike / CNG | 15–20k | 1K | ≤ 700 KB |

LODs and impostors keep phones at 30 FPS. All assets pass `pnpm budget` in CI.

## 6. Chosen route (owner, 2026-11-21): FREE assets
| Step | Status |
|---|---|
| CC0 photo textures from Poly Haven (asphalt, plaster, concrete, brick paving, rusted shutter, corrugated tin) — checksum-verified, resized 1024 px desktop / 512 px phones, normal maps except Lite (`pnpm assets:textures`, credits in `public/assets/textures/CREDITS.md`) | ✅ done |
| Realistic characters: **MakeHuman** (free desktop app, CC0 output) → export `.glb`/FBX with a game skeleton, faces with expressions | ⏳ needs owner: install MakeHuman and export bodies (guide below), or approve a specific downloadable CC0 base |
| Animations: **Mixamo** (free with an Adobe account, allowed in games) → walk/run/jump/punch/drive/talk | ⏳ needs owner login to download |
| Realistic cars: CC0/CC-BY models (Sketchfab, Poly Pizza) → our parody names, no logos | ⏳ needs owner login to download; we keep a credits list for CC-BY |
| Engine support for loading these models (glTF + Meshopt + KTX2, skinned characters with blendshapes) | next coding step once the first files arrive |

**How to send models:** put the files in `assets-src/incoming/` (characters, animations, cars). The pipeline (`tools/asset-pipeline/optimize.mjs`) compresses them and the engine swaps the code-generated placeholders for them — same game code (`Humanoid` / `VehicleVisual` APIs).

## 7. Original decision options
1. **Asset budget:** free (MakeHuman + Mixamo + CC0/CC-BY models, more of my own Blender work) vs paid (buy realistic car/character packs ~US$20–80 each, or hire a 3D artist).
2. **Voice:** hire Bangladeshi voice actors (best and funniest) or start with AI text-to-speech (see `10-AUDIO-DIALOGUE.md`).
