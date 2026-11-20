# Audio, Voice & Dialogue

Goal: the city **talks and sounds like Dhaka**, and it's funny. Every NPC type speaks its own way (Dhakaiya, rickshaw-wala, neta speech, shopkeeper, police, foreigner in English). The player can talk back.

## 1. How talking works (same approach as GTA V)
GTA does **not** let NPCs invent speech: every line is written and recorded in advance, then picked by context. We do the same, plus a player choice menu:

| Layer | What it is | Example |
|---|---|---|
| **Barks** | Short context lines NPCs say automatically | bumped by player, car honks, near-miss, seeing a gun, idle chatter |
| **Player speech** | Mostofa's lines, chosen by the player from a talk menu or auto-triggered | greet, threaten, snatch, order food, taunt police |
| **Conversations** | Scripted mission dialogue with subtitles | cutscenes, phone calls |
| **Speeches** | Long lines for rallies (neta), radio DJ, street hawkers | "ভাইসব, আমি আপনাদের জন্য…" |
| **Later (optional)** | AI-generated replies (LLM) for free chat with NPCs | needs a paid API + moderation; Phase 9+ |

### Talk menu (near an NPC)
| Option | Effect |
|---|---|
| **সালাম দাও** (Greet) | NPC replies friendly/funny; small Public Love +1 |
| **হুমকি দাও** (Threaten) | NPC gets scared or fights back; Notoriety +1 |
| **ছিনতাই** (Snatch) | Take money/item, NPC screams "ধর! ধর!", crowd reacts (police from Phase 4) |
| **অর্ডার** (shops/stalls) | Buy cha, fuchka, biryani → pay Taka, health/stamina buff |
| **ছিনিয়ে নাও** (shops/stalls) | Grab the food without paying → shopkeeper chases/curses |

Keyboard: `T` talk / `1–4` options · Touch: "কথা" button opens a radial menu · Gamepad: d-pad.

## 2. Voice sources
| Option | Quality | Cost | Plan |
|---|---|---|---|
| **Bangladeshi voice actors** (recorded) | Best, really funny delivery | Paid per line/session | ✅ Target for launch. Recording sheet generated from `content/dialogue/*.json` |
| AI text-to-speech (Bangla voices) | Good for prototyping, weaker comedy timing | Paid API | Temp voices during development |
| Browser built-in speech | Robotic, depends on device | Free | Fallback only, off by default |
| **Subtitles only** | No audio | Free | ✅ Now: every line shows Bangla subtitle; audio slot filled later |

**Rules:** we write **original lines**. We do not copy recordings or exact dialogue from other games (e.g. Baper Rasta), films or dramas; we may write lines in the same *style* (Dhallywood drama, meme tone). No real people's voices or impressions of real politicians.

## 3. Dialogue data (changeable anytime)
`packages/content/src/dialogue/*.json`. Each line:
```json
{ "id": "rickshaw.bump.03", "speaker": "rickshaw", "situation": "bumped",
  "bn": "ওই মিয়া! চোখ কি পকেটে রাখছেন?", "en": "Hey! Did you leave your eyes in your pocket?",
  "emotion": "angry", "audio": null, "weight": 1 }
```
- `speaker` = archetype (hero, rickshaw, shopkeeper, tea, neta, police, foreigner, aunty, student, hawker…)
- `situation` = when it plays (greet, threaten, snatched, bumped, honked, idle, order, chase, crash, enterVehicle…)
- `emotion` drives the face (happy, angry, scared, smug, surprised)
- `audio` = file path once recorded (null = subtitle only)
- Anti-repeat: the same line isn't picked twice in a row per speaker.

## 4. Sound effects
| Sound | Now (Phase 1.5) | Later |
|---|---|---|
| Engines (car, bike, CNG two-stroke putt-putt, bus diesel) | **Synthesized live** with Web Audio, pitch follows speed/throttle | Recorded loops per vehicle |
| Horns (car, bike, CNG squeak, bus air horn, rickshaw bell) | Synthesized | Recorded |
| Tyre skid, crash, footsteps, jump/land | Synthesized | Recorded |
| City ambience (traffic hum, distant horns, hawkers, azaan at prayer times respectfully) | Synthesized hum + random horns | Recorded beds |
| Radio stations | — | Phase 7 (original music) |
| Weapons, explosions | — | Phase 4 |

Mixer: master / SFX / voice / music volumes in settings; audio unlocks on the first tap (browser rule); 3D positional sound for NPCs and vehicles.

## 5. Recording sheet
`pnpm dialogue:sheet` (Phase 7) will export every line as a CSV (id, speaker, emotion, Bangla text, English meaning) for voice actors. File names = line ids, so dropping recorded `.ogg` files in `public/assets/voice/` enables them automatically.
