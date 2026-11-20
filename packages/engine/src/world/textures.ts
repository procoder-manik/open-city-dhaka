import * as THREE from 'three/webgpu';
import { seededRandom } from './random';

/** Font stack for Bangla text drawn into canvases (set from the app's loaded web font). */
let banglaFont = "'Hind Siliguri', 'Noto Sans Bengali', 'Nirmala UI', 'Vrinda', sans-serif";
export function setBanglaFont(family: string | null | undefined) {
  if (family) banglaFont = `${family}, ${banglaFont}`;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, repeat = false, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function noise(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  amount: number,
  rand: () => number,
) {
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    img.data[i] = Math.max(0, Math.min(255, img.data[i]! + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1]! + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2]! + n));
  }
  g.putImageData(img, 0, 0);
}

export const FACADE_CELLS = 4; // texture holds 4 bays × 4 floors

/**
 * Dhaka apartment facade: plastered wall, windows with grills, sills, stains.
 * Returns colour map and an emissive map (some windows lit at night).
 */
export function facadeTextures(
  wall: string,
  seed: number,
): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const S = 512;
  const cell = S / FACADE_CELLS;
  const rand = seededRandom(seed);
  const [c, g] = canvas(S, S);
  const [ec, eg] = canvas(S, S);
  g.fillStyle = wall;
  g.fillRect(0, 0, S, S);
  noise(g, S, S, 18, rand);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, S, S);

  for (let fy = 0; fy < FACADE_CELLS; fy++) {
    for (let fx = 0; fx < FACADE_CELLS; fx++) {
      const x = fx * cell;
      const y = fy * cell;
      // Floor slab line
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x, y + cell - 6, cell, 6);
      // Window
      const wx = x + cell * 0.18;
      const wy = y + cell * 0.18;
      const ww = cell * 0.64;
      const wh = cell * 0.52;
      const grad = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
      grad.addColorStop(0, '#3a4d5c');
      grad.addColorStop(0.5, '#1d2731');
      grad.addColorStop(1, '#2c3b47');
      g.fillStyle = grad;
      g.fillRect(wx, wy, ww, wh);
      // Curtain sometimes
      if (rand() < 0.4) {
        g.fillStyle = ['#a33b3b', '#d8b24a', '#4f7a4f', '#d9d2c3'][Math.floor(rand() * 4)]!;
        g.globalAlpha = 0.55;
        g.fillRect(wx + ww * (rand() < 0.5 ? 0 : 0.5), wy, ww * 0.5, wh);
        g.globalAlpha = 1;
      }
      // Grill (classic Dhaka)
      g.strokeStyle = 'rgba(70,70,70,0.9)';
      g.lineWidth = 2;
      for (let i = 1; i < 6; i++) {
        const gx = wx + (ww * i) / 6;
        g.beginPath();
        g.moveTo(gx, wy - 4);
        g.lineTo(gx, wy + wh + 4);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(wx - 4, wy + wh / 2);
      g.lineTo(wx + ww + 4, wy + wh / 2);
      g.stroke();
      g.strokeRect(wx - 4, wy - 4, ww + 8, wh + 8);
      // Sill + rain stain
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(wx - 8, wy + wh + 4, ww + 16, 5);
      g.fillStyle = 'rgba(40,30,20,0.12)';
      g.fillRect(wx + ww * 0.2, wy + wh + 9, ww * 0.6, cell * 0.2 * rand());
      // Night: some windows lit warm, some cool (tube light)
      if (rand() < 0.55) {
        eg.fillStyle = rand() < 0.7 ? '#ffc070' : '#d8f0ff';
        eg.globalAlpha = 0.5 + rand() * 0.5;
        eg.fillRect(wx + 3, wy + 3, ww - 6, wh - 6);
        eg.globalAlpha = 1;
      }
    }
  }
  return { map: toTexture(c, true), emissive: toTexture(ec, true) };
}

export const SIGN_COLS = 4;
export const SIGN_ROWS = 8;

const SIGN_TEXTS: Array<[string, string]> = [
  ['মায়ের দোয়া স্টোর', 'MAYER DOA STORE'],
  ['বিসমিল্লাহ হোটেল', 'HOTEL & RESTAURANT'],
  ['নিউ স্টার বিরিয়ানি', 'KACCHI • TEHARI'],
  ['ফ্লেক্সিলোড এখানে', 'MOBILE RECHARGE'],
  ['আল্লাহর দান ফার্মেসী', 'PHARMACY'],
  ['ভাই ভাই টেইলার্স', 'TAILORS'],
  ['জনতা টি স্টল', 'CHA • BISCUIT'],
  ['মোবাইল সার্ভিসিং', 'SERVICING CENTER'],
  ['স্বপ্ন কোচিং সেন্টার', 'SSC • HSC'],
  ['তাজমহল জুয়েলার্স', 'JEWELLERS'],
  ['রহমান হার্ডওয়্যার', 'HARDWARE'],
  ['মামা হালিম', 'HALEEM • NIHARI'],
  ['ঢাকা ফুচকা হাউস', 'FUCHKA • CHOTPOTI'],
  ['সততা ইলেকট্রনিক্স', 'ELECTRONICS'],
  ['নিউ মডেল সেলুন', 'HAIR CUT'],
  ['কাচ্চি কিং', 'BIRYANI HOUSE'],
  ['মোহাম্মদপুর কম্পিউটার', 'PRINT • PHOTOCOPY'],
  ['ভাই ভাই স্টোর', 'GROCERY'],
  ['সোনার বাংলা মিষ্টি', 'SWEETS'],
  ['আল-আমিন ট্রেডার্স', 'TRADERS'],
  ['নূর অপটিক্স', 'OPTICS'],
  ['বিসমিল্লাহ ক্লথ স্টোর', 'CLOTH STORE'],
  ['মা ফার্নিচার', 'FURNITURE'],
  ['গ্রীন লাইফ ডায়াগনস্টিক', 'DIAGNOSTIC'],
  ['রাজধানী কনফেকশনারী', 'BAKERY'],
  ['দেশী মুরগি হাউস', 'CHICKEN'],
  ['নিউ ঢাকা গার্মেন্টস', 'FASHION'],
  ['শাপলা পান ঘর', 'PAN • JORDA'],
  ['আদর্শ লাইব্রেরি', 'BOOKS'],
  ['কাঁচা বাজার', 'FRESH VEG'],
  ['টাইম জোন ওয়াচ', 'WATCH'],
  ['জামান টেলিকম', 'TELECOM'],
];

const SIGN_BG = [
  '#c62828',
  '#1565c0',
  '#2e7d32',
  '#f9a825',
  '#6a1b9a',
  '#00838f',
  '#ef6c00',
  '#ad1457',
  '#283593',
  '#d84315',
];

/** One atlas with all shop signboards (one draw call for every sign in the street). */
export function signAtlas(seed: number): THREE.CanvasTexture {
  const W = 1024;
  const H = 1024;
  const cw = W / SIGN_COLS;
  const ch = H / SIGN_ROWS;
  const rand = seededRandom(seed);
  const [c, g] = canvas(W, H);
  SIGN_TEXTS.forEach(([bn, en], i) => {
    const x = (i % SIGN_COLS) * cw;
    const y = Math.floor(i / SIGN_COLS) * ch;
    const bg = SIGN_BG[Math.floor(rand() * SIGN_BG.length)]!;
    const light = bg === '#f9a825';
    const grad = g.createLinearGradient(x, y, x, y + ch);
    grad.addColorStop(0, bg);
    grad.addColorStop(1, shade(bg, -30));
    g.fillStyle = grad;
    g.fillRect(x, y, cw, ch);
    g.strokeStyle = light ? '#5d4037' : '#fff8e1';
    g.lineWidth = 5;
    g.strokeRect(x + 6, y + 6, cw - 12, ch - 12);
    g.fillStyle = light ? '#3e2723' : '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fitText(g, bn, x + cw / 2, y + ch * 0.42, cw - 30, 44, `700 {size}px ${banglaFont}`);
    g.fillStyle = light ? '#4e342e' : '#ffe082';
    fitText(g, en, x + cw / 2, y + ch * 0.78, cw - 40, 18, '700 {size}px Arial, sans-serif');
    // weathering
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(x, y + ch - 10, cw, 10);
  });
  return toTexture(c);
}

function fitText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  size: number,
  fontTpl: string,
) {
  let s = size;
  g.font = fontTpl.replace('{size}', String(s));
  while (g.measureText(text).width > maxW && s > 10) {
    s -= 2;
    g.font = fontTpl.replace('{size}', String(s));
  }
  g.fillText(text, x, y);
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const gg = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${gg},${b})`;
}

/** Left half: rolling shutter with posters; right half: open shop interior. */
export function shopfrontTexture(seed: number): THREE.CanvasTexture {
  const rand = seededRandom(seed);
  const [c, g] = canvas(512, 256);
  // Shutter
  g.fillStyle = '#7c8086';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 8) {
    g.fillStyle = y % 16 === 0 ? '#8d9197' : '#6c7076';
    g.fillRect(0, y, 256, 4);
  }
  noise(g, 256, 256, 22, rand);
  for (let i = 0; i < 3; i++) {
    g.fillStyle = ['#e53935', '#fdd835', '#43a047', '#1e88e5'][Math.floor(rand() * 4)]!;
    g.fillRect(20 + rand() * 180, 30 + rand() * 150, 40, 56);
  }
  g.fillStyle = '#3b3b3b';
  g.fillRect(110, 236, 36, 12); // lock
  // Open shop: dark interior with shelves of colourful goods
  g.fillStyle = '#2a211b';
  g.fillRect(256, 0, 256, 256);
  for (let sy = 30; sy < 230; sy += 50) {
    g.fillStyle = '#5a4030';
    g.fillRect(256, sy + 36, 256, 6);
    for (let sx = 262; sx < 506; sx += 14) {
      g.fillStyle = `hsl(${Math.floor(rand() * 360)},70%,${45 + rand() * 20}%)`;
      g.fillRect(sx, sy + 6 + rand() * 10, 10, 26);
    }
  }
  g.fillStyle = 'rgba(255,220,150,0.25)';
  g.fillRect(256, 0, 256, 256);
  return toTexture(c);
}

export function asphaltTexture(seed: number): THREE.CanvasTexture {
  const rand = seededRandom(seed);
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#3a3a3c';
  g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 26, rand);
  // patches and cracks
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(${rand() < 0.5 ? '20,20,22' : '70,68,64'},0.35)`;
    g.beginPath();
    g.ellipse(
      rand() * 256,
      rand() * 256,
      10 + rand() * 30,
      6 + rand() * 18,
      rand() * 3,
      0,
      Math.PI * 2,
    );
    g.fill();
  }
  g.strokeStyle = 'rgba(15,15,15,0.5)';
  g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    let x = rand() * 256;
    let y = rand() * 256;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rand() - 0.5) * 30;
      y += (rand() - 0.5) * 30;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return toTexture(c, true);
}

export function pavementTexture(seed: number): THREE.CanvasTexture {
  const rand = seededRandom(seed);
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#9c9488';
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 32) {
    for (let x = 0; x < 128; x += 32) {
      const v = 140 + Math.floor(rand() * 30);
      g.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
      g.fillRect(x + 1, y + 1, 30, 30);
    }
  }
  noise(g, 128, 128, 20, rand);
  return toTexture(c, true);
}
