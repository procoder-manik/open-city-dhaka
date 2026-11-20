import * as THREE from 'three/webgpu';
import { STREET } from './StreetBlock';
import { getBanglaFont } from './textures';

export interface WantedInfo {
  heroFull: string;
  heroName: string;
  stars: number;
  crimes: number;
  snatches: number;
  thefts: number;
  headline: string | null;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Police-file style mugshot of Mostofa drawn on a canvas (no photo assets). */
function drawMugshot(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = '#cfd4d8';
  g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 2;
  g.font = `600 ${Math.round(h * 0.05)}px Arial`;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 1; i < 8; i++) {
    const ly = y + (h * i) / 8;
    g.beginPath();
    g.moveTo(x, ly);
    g.lineTo(x + w, ly);
    g.stroke();
    g.fillText(`${190 - i * 10}`, x + 4, ly - 3);
  }
  const cx = x + w / 2;
  const cy = y + h * 0.48;
  // Shirt (red, open) + black tee + gold chain
  g.fillStyle = hex(0x7a1424);
  g.beginPath();
  g.ellipse(cx, y + h * 1.02, w * 0.48, h * 0.3, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#111214';
  g.beginPath();
  g.moveTo(cx - w * 0.12, y + h * 0.74);
  g.lineTo(cx + w * 0.12, y + h * 0.74);
  g.lineTo(cx, y + h);
  g.fill();
  g.strokeStyle = '#d4a33a';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, y + h * 0.76, w * 0.09, 0.2, Math.PI - 0.2);
  g.stroke();
  // Neck + face
  g.fillStyle = hex(0x8d5a3b);
  g.fillRect(cx - w * 0.07, y + h * 0.62, w * 0.14, h * 0.12);
  g.beginPath();
  g.ellipse(cx, cy, w * 0.2, h * 0.24, 0, 0, Math.PI * 2);
  g.fill();
  // Stubble
  g.fillStyle = 'rgba(40,28,22,0.45)';
  g.beginPath();
  g.ellipse(cx, cy + h * 0.1, w * 0.17, h * 0.12, 0, 0, Math.PI);
  g.fill();
  // Hair with quiff
  g.fillStyle = '#120d0b';
  g.beginPath();
  g.ellipse(cx, cy - h * 0.15, w * 0.21, h * 0.11, 0, Math.PI, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(cx + w * 0.02, cy - h * 0.24, w * 0.14, h * 0.06, -0.2, 0, Math.PI * 2);
  g.fill();
  // Aviators
  g.fillStyle = '#050608';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + s * w * 0.085, cy - h * 0.02, w * 0.075, h * 0.05, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#d4a33a';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx - w * 0.02, cy - h * 0.035);
  g.lineTo(cx + w * 0.02, cy - h * 0.035);
  g.stroke();
  // Mustache + smirk
  g.fillStyle = '#120d0b';
  g.fillRect(cx - w * 0.07, cy + h * 0.075, w * 0.14, h * 0.022);
  g.strokeStyle = '#5a2a22';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx - w * 0.05, cy + h * 0.13);
  g.quadraticCurveTo(cx + w * 0.02, cy + h * 0.15, cx + w * 0.07, cy + h * 0.115);
  g.stroke();
  g.restore();
}

function fit(g: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 700) {
  let s = size;
  const font = getBanglaFont();
  g.font = `${weight} ${s}px ${font}`;
  while (g.measureText(text).width > maxW && s > 10) {
    s -= 2;
    g.font = `${weight} ${s}px ${font}`;
  }
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

const toBn = (n: number) => n.toLocaleString('bn-BD');

/**
 * Dynamic "ওয়ান্টেড" posters on poles and a breaking-news billboard. Each player
 * sees their own hero name; everything redraws when crimes or the name change.
 */
export class WantedBoards {
  readonly group = new THREE.Group();
  private posterCanvas = document.createElement('canvas');
  private boardCanvas = document.createElement('canvas');
  private posterTex: THREE.CanvasTexture;
  private boardTex: THREE.CanvasTexture;
  private materials: THREE.Material[] = [];
  private lastKey = '';

  constructor() {
    this.posterCanvas.width = 384;
    this.posterCanvas.height = 512;
    this.boardCanvas.width = 1024;
    this.boardCanvas.height = 512;
    this.posterTex = new THREE.CanvasTexture(this.posterCanvas);
    this.boardTex = new THREE.CanvasTexture(this.boardCanvas);
    for (const t of [this.posterTex, this.boardTex]) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
    }
    const posterMat = new THREE.MeshStandardMaterial({
      map: this.posterTex,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    const boardMat = new THREE.MeshStandardMaterial({
      map: this.boardTex,
      emissiveMap: this.boardTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.35,
      roughness: 0.6,
    });
    const steel = new THREE.MeshStandardMaterial({
      color: 0x4a4d52,
      roughness: 0.6,
      metalness: 0.6,
    });
    this.materials.push(posterMat, boardMat, steel);

    // Posters on poles (both sides near the spawn), facing the road
    const { roadHalf } = STREET;
    const poleZ = [-14, 8, 30, -36];
    for (const side of [-1, 1] as const) {
      const px = side * (roadHalf + 0.5);
      for (const z of poleZ) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), posterMat);
        m.position.set(px - side * 0.18, 3.2, z);
        m.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
        this.group.add(m);
      }
    }

    // Two roadside billboards on steel legs
    const boards: Array<[number, number, number]> = [
      [-(roadHalf + 2.0), 22, Math.PI / 2],
      [roadHalf + 2.0, -58, -Math.PI / 2],
    ];
    for (const [x, z, ry] of boards) {
      const b = new THREE.Group();
      b.position.set(x, 0, z);
      b.rotation.y = ry;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), boardMat);
      panel.position.y = 8;
      panel.castShadow = true;
      b.add(panel);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(8.3, 4.3, 0.2), steel);
      frame.position.set(0, 8, -0.12);
      b.add(frame);
      for (const lx of [-2.6, 2.6]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6, 8), steel);
        leg.position.set(lx, 3, -0.2);
        leg.castShadow = true;
        b.add(leg);
      }
      this.group.add(b);
    }
  }

  update(info: WantedInfo) {
    const key = JSON.stringify(info);
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.drawPoster(info);
    this.drawBoard(info);
    this.posterTex.needsUpdate = true;
    this.boardTex.needsUpdate = true;
  }

  private drawPoster(i: WantedInfo) {
    const g = this.posterCanvas.getContext('2d')!;
    const W = this.posterCanvas.width;
    const H = this.posterCanvas.height;
    g.fillStyle = '#efe3c2';
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(120,90,40,0.15)';
    for (let k = 0; k < 40; k++) g.fillRect(Math.random() * W, Math.random() * H, 3, 3);
    g.fillStyle = '#b71c1c';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fit(g, 'ওয়ান্টেড', W - 40, 64, 800);
    g.fillText('ওয়ান্টেড', W / 2, 46);
    g.fillStyle = '#3e2723';
    g.font = '700 18px Arial';
    g.fillText('WANTED • DEAD OR ALIVE • JINDA BA MURDA', W / 2, 88);
    drawMugshot(g, 52, 104, W - 104, 220);
    g.strokeStyle = '#3e2723';
    g.lineWidth = 4;
    g.strokeRect(52, 104, W - 104, 220);
    g.fillStyle = '#212121';
    fit(g, i.heroFull, W - 30, 40, 800);
    g.fillText(i.heroFull, W / 2, 356);
    const reward = Math.max(1, i.stars) * 5000;
    g.fillStyle = '#b71c1c';
    fit(g, `পুরস্কার: ৳${toBn(reward)}`, W - 40, 32, 800);
    g.fillText(`পুরস্কার: ৳${toBn(reward)}`, W / 2, 400);
    g.fillStyle = '#3e2723';
    const charge =
      i.crimes === 0
        ? 'অভিযোগ: সন্দেহজনক স্টাইল'
        : `অভিযোগ: ছিনতাই ${toBn(i.snatches)}, গাড়ি চুরি ${toBn(i.thefts)}, মোট ${toBn(i.crimes)}`;
    fit(g, charge, W - 30, 20, 600);
    g.fillText(charge, W / 2, 440);
    fit(g, 'দেখামাত্র থানায় খবর দিন — ওসি কামাল পাশা', W - 30, 17, 600);
    g.fillText('দেখামাত্র থানায় খবর দিন — ওসি কামাল পাশা', W / 2, 476);
  }

  private drawBoard(i: WantedInfo) {
    const g = this.boardCanvas.getContext('2d')!;
    const W = this.boardCanvas.width;
    const H = this.boardCanvas.height;
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0d1b2a');
    grad.addColorStop(1, '#1b263b');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // Channel bar
    g.fillStyle = '#c62828';
    g.fillRect(0, 0, W, 90);
    g.fillStyle = '#ffffff';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    fit(g, i.headline ? 'ব্রেকিং নিউজ' : 'খবর ঝালমুড়ি ২৪', 420, 54, 800);
    g.fillText(i.headline ? 'ব্রেকিং নিউজ' : 'খবর ঝালমুড়ি ২৪', 28, 46);
    g.textAlign = 'right';
    g.font = '700 26px Arial';
    g.fillText('JHALMURI 24 • LIVE', W - 28, 46);
    drawMugshot(g, 28, 120, 300, 300);
    g.textAlign = 'left';
    g.fillStyle = '#ffeb3b';
    const text = i.headline ?? `${i.heroFull}: এলাকায় নতুন মুখ, সবাই সাবধান!`;
    fit(g, 'X', 600, 50, 800);
    const lines = wrap(g, text, W - 380).slice(0, 4);
    lines.forEach((l, k) => g.fillText(l, 356, 160 + k * 64));
    // Ticker
    g.fillStyle = '#ffffff';
    g.fillRect(0, H - 70, W, 70);
    g.fillStyle = '#c62828';
    g.fillRect(0, H - 70, 150, 70);
    g.fillStyle = '#ffffff';
    g.font = '800 30px Arial';
    g.fillText('LIVE', 34, H - 35);
    g.fillStyle = '#111111';
    const ticker = `ওয়ান্টেড লেভেল: ${'★'.repeat(i.stars) || '—'} • মোট অভিযোগ: ${toBn(i.crimes)} • পুরস্কার ঘোষণা: ৳${toBn(Math.max(1, i.stars) * 5000)}`;
    fit(g, ticker, W - 190, 30, 700);
    g.fillText(ticker, 170, H - 35);
  }

  dispose() {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const m of this.materials) m.dispose();
    this.posterTex.dispose();
    this.boardTex.dispose();
  }
}
