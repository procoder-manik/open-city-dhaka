'use client';

import { useEffect, useRef, useState } from 'react';
import type { CityIndex, Game, MinimapData } from '@game/engine';
import styles from './play.module.css';

const BASE = '/assets/map/mohammadpur';
const PX_PER_M = 0.35;
const VIEW_RADIUS_M = 170;
const ROAD_STYLE: Array<[string, number]> = [
  ['#6b6458', 1.2], // footway/service
  ['#8a8274', 1.6],
  ['#d8d2c4', 2.4], // residential
  ['#f2e3b0', 3.2], // tertiary
  ['#ffcf6b', 4.2], // secondary
  ['#ffb347', 5.2], // primary/trunk
];
const POI_ICON: Record<string, string> = {
  place_of_worship: '🕌',
  police: '🚓',
  hospital: '🏥',
  school: '🏫',
  bus_station: '🚌',
  marketplace: '🛒',
};

interface MapArt {
  canvas: HTMLCanvasElement;
  index: CityIndex;
  ox: number;
  oz: number;
}

async function buildMapArt(): Promise<MapArt | null> {
  try {
    const [index, mm] = await Promise.all([
      fetch(`${BASE}/index.json`).then((r) => r.json() as Promise<CityIndex>),
      fetch(`${BASE}/minimap.json`).then((r) => r.json() as Promise<MinimapData>),
    ]);
    const b = index.bounds;
    const c = document.createElement('canvas');
    c.width = Math.ceil((b.maxX - b.minX) * PX_PER_M);
    c.height = Math.ceil((b.maxZ - b.minZ) * PX_PER_M);
    const g = c.getContext('2d')!;
    g.fillStyle = '#2b2f2a';
    g.fillRect(0, 0, c.width, c.height);
    g.lineCap = 'round';
    for (let rank = 0; rank < ROAD_STYLE.length; rank++) {
      const [color, w] = ROAD_STYLE[rank]!;
      g.strokeStyle = color;
      g.lineWidth = w;
      g.beginPath();
      for (const [r, ax, az, bx, bz] of mm.roads) {
        if (Math.min(r, 5) !== rank) continue;
        g.moveTo((ax - b.minX) * PX_PER_M, (az - b.minZ) * PX_PER_M);
        g.lineTo((bx - b.minX) * PX_PER_M, (bz - b.minZ) * PX_PER_M);
      }
      g.stroke();
    }
    return { canvas: c, index, ox: b.minX, oz: b.minZ };
  } catch {
    return null;
  }
}

let artPromise: Promise<MapArt | null> | null = null;
const getArt = () => (artPromise ??= buildMapArt());

/** Rotation that turns the camera's forward direction to "up" on the map. */
function mapRotation(yaw: number): number {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  return -Math.PI / 2 - Math.atan2(fz, fx);
}

/** Circular GTA-style minimap that rotates with the camera. */
export function Minimap({ game }: { game: Game }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let art: MapArt | null = null;
    let raf = 0;
    let alive = true;
    void getArt().then((a) => {
      art = a;
      if (alive) setReady(!!a);
    });
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = ref.current;
      if (!c || !art) return;
      const g = c.getContext('2d')!;
      const size = c.width;
      const { pos, heading, wanted } = game.store.getState();
      const scale = size / 2 / VIEW_RADIUS_M / PX_PER_M;
      g.clearRect(0, 0, size, size);
      g.save();
      g.beginPath();
      g.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = '#2b2f2a';
      g.fillRect(0, 0, size, size);
      g.translate(size / 2, size / 2);
      g.rotate(mapRotation(heading));
      g.scale(scale, scale);
      g.translate(-(pos[0] - art.ox) * PX_PER_M, -(pos[1] - art.oz) * PX_PER_M);
      g.drawImage(art.canvas, 0, 0);
      g.restore();
      // POIs (upright icons)
      g.save();
      g.font = '13px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const rot = mapRotation(heading);
      for (const p of art.index.pois) {
        const icon = POI_ICON[p.k];
        if (!icon) continue;
        const dx = (p.x - pos[0]) / VIEW_RADIUS_M;
        const dz = (p.z - pos[1]) / VIEW_RADIUS_M;
        if (dx * dx + dz * dz > 0.85) continue;
        const rx = dx * Math.cos(rot) - dz * Math.sin(rot);
        const rz = dx * Math.sin(rot) + dz * Math.cos(rot);
        g.fillText(icon, size / 2 + (rx * size) / 2, size / 2 + (rz * size) / 2);
      }
      // Petrol pumps + garages
      const { stations: stationIcons } = game.store.getState();
      g.font = '13px sans-serif';
      for (const [sx, sz, type] of stationIcons) {
        const dx = (sx - pos[0]) / VIEW_RADIUS_M;
        const dz = (sz - pos[1]) / VIEW_RADIUS_M;
        if (dx * dx + dz * dz > 0.85) continue;
        const rx = dx * Math.cos(rot) - dz * Math.sin(rot);
        const rz = dx * Math.sin(rot) + dz * Math.cos(rot);
        g.fillText(
          type === 'pump' ? '⛽' : '🔧',
          size / 2 + (rx * size) / 2,
          size / 2 + (rz * size) / 2,
        );
      }
      // Mission blips: yellow = mission start, blue = objective (clamped to the rim)
      const { missionBlips, mission } = game.store.getState();
      const blip = (x: number, z: number, color: string, label: string) => {
        let dx = (x - pos[0]) / VIEW_RADIUS_M;
        let dz = (z - pos[1]) / VIEW_RADIUS_M;
        const d = Math.hypot(dx, dz);
        if (d > 0.88) {
          dx *= 0.88 / d;
          dz *= 0.88 / d;
        }
        const rx = dx * Math.cos(rot) - dz * Math.sin(rot);
        const rz = dx * Math.sin(rot) + dz * Math.cos(rot);
        const px = size / 2 + (rx * size) / 2;
        const py = size / 2 + (rz * size) / 2;
        g.fillStyle = color;
        g.strokeStyle = '#000';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(px, py, 6.5, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = '#000';
        g.font = 'bold 9px sans-serif';
        g.fillText(label, px, py + 0.5);
      };
      for (const [x, z] of missionBlips) blip(x, z, '#ffc21a', 'M');
      if (mission?.target) blip(mission.target[0], mission.target[1], '#3aa0ff', '★');
      g.restore();
      // Player arrow (always up) + wanted ring
      g.save();
      g.translate(size / 2, size / 2);
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#000000';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, -9);
      g.lineTo(7, 7);
      g.lineTo(0, 3);
      g.lineTo(-7, 7);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
      g.strokeStyle =
        wanted > 0
          ? Math.floor(performance.now() / 400) % 2
            ? '#e53935'
            : '#1e88e5'
          : 'rgba(255,255,255,0.6)';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
      g.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [game]);

  return (
    <canvas
      ref={ref}
      width={150}
      height={150}
      className={styles.minimap}
      style={{ opacity: ready ? 1 : 0 }}
      data-testid="minimap"
      aria-label="Minimap"
    />
  );
}

/** Full map (pause menu) with road names and your position. */
export function FullMap({ game }: { game: Game }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    void getArt().then((art) => {
      const c = ref.current;
      if (!c || !art) return;
      const s = Math.min(c.width / art.canvas.width, c.height / art.canvas.height);
      const g = c.getContext('2d')!;
      g.fillStyle = '#1f221f';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(art.canvas, 0, 0, art.canvas.width * s, art.canvas.height * s);
      const toPx = (x: number, z: number): [number, number] => [
        (x - art.ox) * PX_PER_M * s,
        (z - art.oz) * PX_PER_M * s,
      ];
      g.font = '600 11px sans-serif';
      g.textAlign = 'center';
      g.fillStyle = '#ffffff';
      g.strokeStyle = 'rgba(0,0,0,0.8)';
      g.lineWidth = 3;
      for (const r of art.index.roads.slice(0, 60)) {
        const [x, y] = toPx(r.x, r.z);
        g.strokeText(r.n, x, y);
        g.fillText(r.n, x, y);
      }
      const { pos, stations: stationIcons } = game.store.getState();
      g.font = '16px sans-serif';
      g.textBaseline = 'middle';
      for (const [sx, sz, type] of stationIcons) {
        const [x, y] = toPx(sx, sz);
        g.fillText(type === 'pump' ? '⛽' : '🔧', x, y);
      }
      const [px, py] = toPx(pos[0], pos[1]);
      g.fillStyle = '#ff9f1c';
      g.beginPath();
      g.arc(px, py, 7, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.stroke();
    });
  }, [game]);
  return (
    <canvas ref={ref} width={560} height={560} className={styles.fullMap} data-testid="full-map" />
  );
}
