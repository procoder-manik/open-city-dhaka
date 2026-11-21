import * as THREE from 'three/webgpu';
import type { QualityPreset } from '@game/shared';

export type WeatherMode = 'auto' | 'clear' | 'rain';

export type WeatherEvent =
  { type: 'rainStart' } | { type: 'rainStop' } | { type: 'thunder'; distance: number };

/**
 * Monsoon cycle (pure, no rendering): dry spells, then showers that build up, sometimes
 * with thunder. `intensity` eases toward the target so rain never pops in.
 */
export class WeatherCycle {
  intensity = 0;
  target = 0;
  raining = false;
  mode: WeatherMode = 'auto';
  private timer: number;
  private thunderTimer = 10;

  constructor(
    private rand: () => number,
    firstDry = 150,
  ) {
    this.timer = firstDry;
  }

  setMode(mode: WeatherMode) {
    this.mode = mode;
    if (mode === 'rain') this.startRain(0.85);
    if (mode === 'clear') this.stopRain();
  }

  private startRain(target: number) {
    this.raining = true;
    this.target = target;
    this.timer = 90 + this.rand() * 150;
    this.thunderTimer = 6 + this.rand() * 10;
  }

  private stopRain() {
    this.raining = false;
    this.target = 0;
    this.timer = 180 + this.rand() * 240;
  }

  update(dt: number): WeatherEvent[] {
    const ev: WeatherEvent[] = [];
    const was = this.intensity > 0.15;
    if (this.mode === 'auto') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.raining) this.stopRain();
        else this.startRain(0.35 + this.rand() * 0.65);
      }
    }
    const rate = this.raining ? 0.06 : 0.04;
    const d = this.target - this.intensity;
    this.intensity += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    const is = this.intensity > 0.15;
    if (is && !was) ev.push({ type: 'rainStart' });
    if (!is && was) ev.push({ type: 'rainStop' });
    if (this.intensity > 0.6) {
      this.thunderTimer -= dt;
      if (this.thunderTimer <= 0) {
        this.thunderTimer = 8 + this.rand() * 22;
        ev.push({ type: 'thunder', distance: this.rand() });
      }
    }
    return ev;
  }

  /** Roads stay wet a while after the rain: a slow follower of `intensity`. */
  wetness(prev: number, dt: number): number {
    const t = Math.min(1, this.intensity * 1.4);
    return t > prev ? Math.min(t, prev + dt * 0.05) : Math.max(t, prev - dt * 0.008);
  }
}

const AREA = 16; // half-size of the rain box around the camera
const HEIGHT = 16;
const FALL = 21; // m/s
const STREAK = 0.9; // m

/**
 * Rain streaks (one LineSegments draw call) that follow the camera, plus wet,
 * shiny roads. Drop count comes from the quality preset (`rainDrops`).
 */
export class Rain {
  readonly object: THREE.LineSegments;
  private pos: Float32Array;
  private attr: THREE.BufferAttribute;
  private seeds: Float32Array;
  private max: number;
  private material: THREE.LineBasicMaterial;
  private surfaces: Array<{
    m: THREE.MeshStandardMaterial;
    color: THREE.Color;
    roughness: number;
  }>;
  wet = 0;
  private wind = new THREE.Vector2(1.2, 0.5);

  constructor(preset: QualityPreset, surfaces: THREE.MeshStandardMaterial[], rand: () => number) {
    this.max = preset.rainDrops;
    this.pos = new Float32Array(Math.max(1, this.max) * 6);
    this.seeds = new Float32Array(Math.max(1, this.max) * 3);
    for (let i = 0; i < this.max; i++) {
      this.seeds[i * 3] = (rand() * 2 - 1) * AREA;
      this.seeds[i * 3 + 1] = rand() * HEIGHT;
      this.seeds[i * 3 + 2] = (rand() * 2 - 1) * AREA;
    }
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    geo.setDrawRange(0, 0);
    this.material = new THREE.LineBasicMaterial({
      color: 0xdfe8f0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.object = new THREE.LineSegments(geo, this.material);
    this.object.frustumCulled = false;
    this.object.visible = false;
    this.object.renderOrder = 5;
    this.surfaces = surfaces.map((m) => ({
      m,
      color: m.color.clone(),
      roughness: m.roughness,
    }));
  }

  update(dt: number, intensity: number, wetness: number, camera: THREE.Camera) {
    // Wet surfaces: darker and glossier (cheap "waterlogged" look, no extra passes)
    if (Math.abs(wetness - this.wet) > 0.002 || (wetness === 0 && this.wet !== 0)) {
      this.wet = wetness;
      for (const s of this.surfaces) {
        s.m.color.copy(s.color).multiplyScalar(1 - 0.38 * wetness);
        s.m.roughness = s.roughness - (s.roughness - 0.28) * wetness;
      }
    }

    const n = Math.floor(this.max * Math.min(1, intensity));
    this.object.visible = n > 0;
    if (!n) return;
    this.material.opacity = 0.3 + 0.4 * intensity;
    const c = camera.position;
    const wx = this.wind.x * intensity;
    const wz = this.wind.y * intensity;
    const sx = (wx / FALL) * STREAK;
    const sz = (wz / FALL) * STREAK;
    const span = AREA * 2;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      let y = this.seeds[k + 1]! - FALL * dt;
      let x = this.seeds[k]! + wx * dt;
      let z = this.seeds[k + 2]! + wz * dt;
      if (y < 0) y += HEIGHT;
      this.seeds[k + 1] = y;
      this.seeds[k] = x;
      this.seeds[k + 2] = z;
      // Wrap into the box around the camera so it never runs out of drops
      x = ((((x - c.x + AREA) % span) + span) % span) - AREA + c.x;
      z = ((((z - c.z + AREA) % span) + span) % span) - AREA + c.z;
      const wy = c.y - HEIGHT * 0.45 + y;
      const o = i * 6;
      this.pos[o] = x;
      this.pos[o + 1] = wy;
      this.pos[o + 2] = z;
      this.pos[o + 3] = x - sx;
      this.pos[o + 4] = wy + STREAK;
      this.pos[o + 5] = z - sz;
    }
    this.object.geometry.setDrawRange(0, n * 2);
    this.attr.needsUpdate = true;
  }

  dispose() {
    this.object.geometry.dispose();
    this.material.dispose();
    for (const s of this.surfaces) {
      s.m.color.copy(s.color);
      s.m.roughness = s.roughness;
    }
  }
}
