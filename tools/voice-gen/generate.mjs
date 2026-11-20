// Generate AI voice files for every dialogue line with Microsoft Azure Speech
// (free F0 tier: 0.5 million characters / month — this game uses ~3,000).
//
// Setup (once): create a free Azure account → "Speech service" resource (Free F0),
// then put the key + region in apps/web/.env.local:
//   AZURE_SPEECH_KEY=xxxxxxxx
//   AZURE_SPEECH_REGION=southeastasia
//
// Usage:
//   pnpm voice:gen            # generate missing files
//   pnpm voice:gen --force    # regenerate everything
//   pnpm voice:gen --dry-run  # show what would be generated (no key needed)
//
// Output: apps/web/public/assets/voice/<line-id>.mp3 + manifest.json (the game
// picks them up automatically; device voice is the fallback).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const outDir = join(root, 'apps', 'web', 'public', 'assets', 'voice');
const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const dry = args.has('--dry-run');

/** Read KEY=value lines from apps/web/.env.local (never printed). */
function loadEnv() {
  const p = join(root, 'apps', 'web', '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

/**
 * Casting: each archetype gets a voice + delivery so they sound different.
 * bn-BD = Bangladeshi accent. Styles via prosody (rate %, pitch semitones).
 */
const CAST = {
  hero: { voice: 'bn-BD-PradeepNeural', rate: '+8%', pitch: '-2st', lang: 'bn-BD' },
  teaChacha: { voice: 'bn-IN-BashkarNeural', rate: '-12%', pitch: '-4st', lang: 'bn-IN' },
  rickshawWala: { voice: 'bn-BD-PradeepNeural', rate: '+18%', pitch: '+3st', lang: 'bn-BD' },
  shopkeeper: { voice: 'bn-IN-BashkarNeural', rate: '+5%', pitch: '+1st', lang: 'bn-IN' },
  foreigner: {
    voice: 'en-GB-RyanNeural',
    rate: '-4%',
    pitch: '+0st',
    lang: 'en-GB',
    useEnglish: true,
  },
  // Female archetypes for later NPCs (aunty, student…)
  aunty: { voice: 'bn-BD-NabanitaNeural', rate: '+6%', pitch: '+1st', lang: 'bn-BD' },
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function ssml(line) {
  const c = CAST[line.speaker] ?? CAST.hero;
  const text = c.useEnglish ? line.en : line.bn;
  // Emotions → a bit more energy/pitch variation
  const extra = {
    angry: ['+6%', '+1st'],
    scared: ['+10%', '+2st'],
    happy: ['+3%', '+1st'],
    smug: ['-4%', '-1st'],
    surprised: ['+5%', '+3st'],
  }[line.emotion] ?? ['+0%', '+0st'];
  const rate = `${parseInt(c.rate, 10) + parseInt(extra[0], 10)}%`;
  const pitch = `${parseInt(c.pitch, 10) + parseInt(extra[1], 10)}st`;
  return `<speak version="1.0" xml:lang="${c.lang}"><voice name="${c.voice}"><prosody rate="${rate.startsWith('-') ? rate : '+' + rate}" pitch="${pitch.startsWith('-') ? pitch : '+' + pitch}">${esc(text)}</prosody></voice></speak>`;
}

const dialogue = JSON.parse(
  readFileSync(join(root, 'packages', 'content', 'src', 'dialogue.json'), 'utf8'),
);
const lines = dialogue.lines;
const chars = lines.reduce((n, l) => n + (CAST[l.speaker]?.useEnglish ? l.en : l.bn).length, 0);
console.log(`${lines.length} lines, ~${chars} characters`);

if (dry) {
  for (const l of lines.slice(0, 5)) console.log(l.id, '→', ssml(l));
  console.log('…dry run only.');
  process.exit(0);
}

const key = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION;
if (!key || !region) {
  console.error(
    'Missing AZURE_SPEECH_KEY / AZURE_SPEECH_REGION in apps/web/.env.local (see header of this file).',
  );
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let made = 0;
for (const line of lines) {
  const file = join(outDir, `${line.id}.mp3`);
  if (!force && existsSync(file)) continue;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'game-voice-gen',
      },
      body: ssml(line),
    });
    if (res.status === 429) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      console.error(`✗ ${line.id}: HTTP ${res.status}`);
      break;
    }
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    made++;
    console.log(`✓ ${line.id}`);
    break;
  }
  await sleep(350); // stay well under the free-tier rate limit
}

const ids = lines.map((l) => l.id).filter((id) => existsSync(join(outDir, `${id}.mp3`)));
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(ids, null, 2));
console.log(`Generated ${made}, total available ${ids.length}/${lines.length}. Manifest updated.`);
