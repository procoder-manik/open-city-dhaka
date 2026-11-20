import * as THREE from 'three/webgpu';
import { seededRandom } from './random';
import { getBanglaFont } from './textures';

export const POSTER_COLS = 4;
export const POSTER_ROWS = 4;

interface PosterDef {
  bg: string;
  fg: string;
  accent: string;
  lines: Array<[string, number]>; // text, relative size
  style?: 'notice' | 'ad' | 'political' | 'lost';
}

/** All original, satirical street posters (no real people, brands or parties). */
const POSTERS: PosterDef[] = [
  {
    bg: '#ffffff',
    fg: '#c62828',
    accent: '#c62828',
    style: 'notice',
    lines: [
      ['এখানে প্রস্রাব', 1],
      ['করা নিষেধ', 1],
      ['করিলে ৫০০ টাকা', 0.6],
      ['জরিমানা', 0.6],
    ],
  },
  {
    bg: '#fff59d',
    fg: '#1a237e',
    accent: '#d32f2f',
    style: 'ad',
    lines: [
      ['জিন-পরী', 1.1],
      ['তাড়ানো হয়', 0.9],
      ['গ্যারান্টি সহকারে', 0.55],
      ['☎ ০১৭XX-XXXXXX', 0.5],
    ],
  },
  {
    bg: '#e3f2fd',
    fg: '#0d47a1',
    accent: '#0d47a1',
    style: 'lost',
    lines: [
      ['হারানো বিজ্ঞপ্তি', 0.8],
      ['আমার মন', 1.1],
      ['পাইলে ফেরত দিন', 0.55],
      ['পুরস্কার: এক কাপ চা', 0.5],
    ],
  },
  {
    bg: '#ffffff',
    fg: '#212121',
    accent: '#2e7d32',
    style: 'notice',
    lines: [
      ['বাসা ভাড়া', 1.1],
      ['দেওয়া হইবে', 0.8],
      ['ব্যাচেলর নিষেধ', 0.65],
      ['বিড়াল চলবে', 0.5],
    ],
  },
  {
    bg: '#1b5e20',
    fg: '#ffeb3b',
    accent: '#ffffff',
    style: 'ad',
    lines: [
      ['৭ দিনে', 0.8],
      ['ইংলিশ শিখুন', 1],
      ['১০০% গ্যারান্টি', 0.6],
      ['না পারলে আবার ৭ দিন', 0.45],
    ],
  },
  {
    bg: '#ffffff',
    fg: '#b71c1c',
    accent: '#b71c1c',
    style: 'notice',
    lines: [
      ['এখানে ময়লা', 0.9],
      ['ফেলিবেন না', 0.9],
      ['আদেশক্রমে', 0.5],
      ['এলাকাবাসী', 0.5],
    ],
  },
  {
    bg: '#4a148c',
    fg: '#ffffff',
    accent: '#ffd54f',
    style: 'ad',
    lines: [
      ['প্রেমে ব্যর্থ?', 0.9],
      ['বাবা বাংলাদেশি', 0.65],
      ['তাবিজে সমাধান', 0.65],
      ['ফলাফল না হলে টাকা ফেরত নাই', 0.4],
    ],
  },
  {
    bg: '#fffde7',
    fg: '#e65100',
    accent: '#e65100',
    style: 'ad',
    lines: [
      ['টিউশনি করাতে চাই', 0.65],
      ['সব বিষয়', 0.8],
      ['বিশেষ করে মোবাইল', 0.5],
      ['গেমস', 0.5],
    ],
  },
  {
    bg: '#0d47a1',
    fg: '#ffffff',
    accent: '#ffeb3b',
    style: 'political',
    lines: [
      ['ঘোড়ার ডিম পার্টি', 0.7],
      ['বাবলু ভাইকে', 0.9],
      ['ভোট দিন', 1],
      ['প্রতীক: ডিম 🥚', 0.55],
    ],
  },
  {
    bg: '#ffffff',
    fg: '#212121',
    accent: '#d32f2f',
    style: 'notice',
    lines: [
      ['সাবধান!', 1.1],
      ['পকেটমার', 0.9],
      ['হইতে সাবধান', 0.7],
      ['— মোস্তফা ছাড়া', 0.5],
    ],
  },
  {
    bg: '#fce4ec',
    fg: '#880e4f',
    accent: '#880e4f',
    style: 'ad',
    lines: [
      ['গ্যারান্টি সহকারে', 0.55],
      ['লম্বা হউন', 1],
      ['মাত্র ৩০ দিনে', 0.6],
      ['(জুতা সহ)', 0.5],
    ],
  },
  {
    bg: '#263238',
    fg: '#80deea',
    accent: '#ffffff',
    style: 'ad',
    lines: [
      ['ফ্রি ওয়াইফাই', 0.9],
      ['পাসওয়ার্ড:', 0.6],
      ['জিজ্ঞাস করবেন না', 0.6],
      ['— চায়ের দোকান', 0.45],
    ],
  },
  {
    bg: '#ffffff',
    fg: '#1b5e20',
    accent: '#1b5e20',
    style: 'notice',
    lines: [
      ['গাড়ি পার্কিং', 0.9],
      ['নিষেধ', 1],
      ['পার্ক করিলে', 0.55],
      ['চাকা খুলে নেওয়া হবে', 0.5],
    ],
  },
  {
    bg: '#ff6f00',
    fg: '#ffffff',
    accent: '#ffffff',
    style: 'ad',
    lines: [
      ['হালিম', 1.2],
      ['মামা স্পেশাল', 0.7],
      ['১ বাটি খাইলে', 0.55],
      ['ঘুম গ্যারান্টি', 0.55],
    ],
  },
  {
    bg: '#e8f5e9',
    fg: '#1b5e20',
    accent: '#1b5e20',
    style: 'lost',
    lines: [
      ['হারানো বিজ্ঞপ্তি', 0.8],
      ['ছাগল (নাম: বাবলু)', 0.65],
      ['বয়স ২ বছর', 0.5],
      ['ডাকলে সাড়া দেয় না', 0.5],
    ],
  },
  {
    bg: '#212121',
    fg: '#ffd600',
    accent: '#ffd600',
    style: 'ad',
    lines: [
      ['জিম', 1.1],
      ['৩ মাসে সিক্স প্যাক', 0.55],
      ['না হলে', 0.5],
      ['ফ্যামিলি প্যাক ফ্রি', 0.55],
    ],
  },
];

function fit(g: CanvasRenderingContext2D, text: string, maxW: number, size: number, font: string) {
  let s = size;
  g.font = `700 ${s}px ${font}`;
  while (g.measureText(text).width > maxW && s > 10) {
    s -= 2;
    g.font = `700 ${s}px ${font}`;
  }
}

/** One atlas with every poster (one draw call for all posters in the street). */
export function posterAtlas(seed: number): THREE.CanvasTexture {
  const cell = 256;
  const c = document.createElement('canvas');
  c.width = cell * POSTER_COLS;
  c.height = cell * POSTER_ROWS;
  const g = c.getContext('2d')!;
  const rand = seededRandom(seed);
  const font = getBanglaFont();
  POSTERS.forEach((p, i) => {
    const x = (i % POSTER_COLS) * cell;
    const y = Math.floor(i / POSTER_COLS) * cell;
    g.save();
    g.beginPath();
    g.rect(x, y, cell, cell);
    g.clip();
    g.fillStyle = p.bg;
    g.fillRect(x, y, cell, cell);
    if (p.style === 'notice') {
      g.strokeStyle = p.accent;
      g.lineWidth = 8;
      g.strokeRect(x + 10, y + 10, cell - 20, cell - 20);
    } else if (p.style === 'political') {
      g.fillStyle = p.accent;
      g.fillRect(x, y + cell - 40, cell, 40);
      g.beginPath();
      g.arc(x + cell / 2, y + 62, 40, 0, Math.PI * 2);
      g.fillStyle = '#ffe0b2';
      g.fill(); // fictional neta portrait placeholder
      g.fillStyle = '#212121';
      g.fillRect(x + cell / 2 - 26, y + 30, 52, 14);
    } else if (p.style === 'lost') {
      g.fillStyle = p.accent;
      g.fillRect(x, y, cell, 36);
    } else {
      g.fillStyle = p.accent;
      g.globalAlpha = 0.25;
      for (let k = 0; k < 6; k++) g.fillRect(x + rand() * cell, y + rand() * cell, 30, 30);
      g.globalAlpha = 1;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const top = p.style === 'political' ? 120 : 50;
    const step = (cell - top - 20) / p.lines.length;
    p.lines.forEach(([text, size], li) => {
      g.fillStyle = li === 0 && p.style === 'lost' ? '#ffffff' : p.fg;
      const ty = p.style === 'lost' && li === 0 ? y + 18 : y + top + step * li + step / 2;
      fit(g, text, cell - 30, Math.round(44 * size), font);
      g.fillText(text, x + cell / 2, ty);
    });
    // Weathering: tears, glue stains, fold lines
    g.globalAlpha = 0.18;
    g.fillStyle = '#5d4037';
    for (let k = 0; k < 3; k++)
      g.fillRect(x + rand() * cell, y + rand() * cell, 2 + rand() * 30, 2 + rand() * 6);
    g.globalAlpha = 0.08;
    g.fillStyle = '#000000';
    g.fillRect(x + cell / 2, y, 2, cell);
    g.globalAlpha = 1;
    g.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const POSTER_COUNT = POSTERS.length;

/** Wide cloth banner hung across the road (fictional neta, satire). */
export function bannerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const g = c.getContext('2d')!;
  const font = getBanglaFont();
  const grad = g.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0, '#0d47a1');
  grad.addColorStop(0.5, '#1565c0');
  grad.addColorStop(1, '#0d47a1');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 160);
  g.fillStyle = '#ffeb3b';
  g.fillRect(0, 0, 1024, 10);
  g.fillRect(0, 150, 1024, 10);
  for (const x of [80, 944]) {
    g.beginPath();
    g.arc(x, 80, 56, 0, Math.PI * 2);
    g.fillStyle = '#ffe0b2';
    g.fill();
    g.fillStyle = '#212121';
    g.fillRect(x - 34, 36, 68, 16);
    g.fillRect(x - 20, 92, 40, 8);
  }
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fit(g, 'বাবলু ভাইয়ের আগমনে মোহাম্মদপুরবাসীর পক্ষ থেকে লাল গোলাপ শুভেচ্ছা', 760, 46, font);
  g.fillText('বাবলু ভাইয়ের আগমনে মোহাম্মদপুরবাসীর পক্ষ থেকে লাল গোলাপ শুভেচ্ছা', 512, 62);
  g.fillStyle = '#ffeb3b';
  fit(g, 'ঘোড়ার ডিম পার্টি • মোহাম্মদপুর শাখা • (রাস্তা দখল কমিটি)', 700, 28, font);
  g.fillText('ঘোড়ার ডিম পার্টি • মোহাম্মদপুর শাখা • (রাস্তা দখল কমিটি)', 512, 118);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
