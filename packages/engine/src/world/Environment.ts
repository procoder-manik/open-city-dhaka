import * as THREE from 'three/webgpu';
import type { QualityPreset } from '@game/shared';

interface Key {
  hour: number;
  skyTop: number;
  horizon: number;
  sun: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fog: number;
  exposure: number;
  /** 0 = day, 1 = full night (lights on). */
  night: number;
}

/** "Golden Dhaka" palette across the day. */
const KEYS: Key[] = [
  {
    hour: 0,
    skyTop: 0x060a18,
    horizon: 0x24304a,
    sun: 0x9fb2ff,
    sunIntensity: 0.45,
    hemiSky: 0x5a6aa0,
    hemiGround: 0x2a2420,
    hemiIntensity: 1.0,
    fog: 0x1c2234,
    exposure: 1.45,
    night: 1,
  },
  {
    hour: 5,
    skyTop: 0x1b2440,
    horizon: 0x8a6a6a,
    sun: 0xffb08a,
    sunIntensity: 0.4,
    hemiSky: 0x6b6f98,
    hemiGround: 0x2a2018,
    hemiIntensity: 0.7,
    fog: 0x6e5f66,
    exposure: 1.15,
    night: 0.7,
  },
  {
    hour: 6.5,
    skyTop: 0x5d8fc7,
    horizon: 0xf3b58a,
    sun: 0xffc28c,
    sunIntensity: 2.0,
    hemiSky: 0xd8c4b0,
    hemiGround: 0x4a4038,
    hemiIntensity: 1.1,
    fog: 0xe0b896,
    exposure: 1.05,
    night: 0.1,
  },
  {
    hour: 12,
    skyTop: 0x5f9ad8,
    horizon: 0xd8e2e6,
    sun: 0xfff2dc,
    sunIntensity: 3.2,
    hemiSky: 0xd6e4f0,
    hemiGround: 0x5a5244,
    hemiIntensity: 1.3,
    fog: 0xc9d2d4,
    exposure: 1.0,
    night: 0,
  },
  {
    hour: 16,
    skyTop: 0x6a92c4,
    horizon: 0xf0d2a8,
    sun: 0xffd8a0,
    sunIntensity: 3.0,
    hemiSky: 0xf0dcc0,
    hemiGround: 0x5a4a38,
    hemiIntensity: 1.25,
    fog: 0xe6cba6,
    exposure: 1.0,
    night: 0,
  },
  {
    hour: 17.5,
    skyTop: 0x5878a8,
    horizon: 0xf6a96a,
    sun: 0xffa860,
    sunIntensity: 2.6,
    hemiSky: 0xffd0a0,
    hemiGround: 0x4c3a2c,
    hemiIntensity: 1.2,
    fog: 0xeab088,
    exposure: 1.05,
    night: 0.15,
  },
  {
    hour: 18.6,
    skyTop: 0x2c3460,
    horizon: 0xd9705a,
    sun: 0xff7a50,
    sunIntensity: 1.0,
    hemiSky: 0x9a7aa0,
    hemiGround: 0x2e2420,
    hemiIntensity: 0.85,
    fog: 0x8a5c5c,
    exposure: 1.15,
    night: 0.6,
  },
  {
    hour: 19.5,
    skyTop: 0x0c1430,
    horizon: 0x3a3456,
    sun: 0x9fb2ff,
    sunIntensity: 0.45,
    hemiSky: 0x5a6aa0,
    hemiGround: 0x2a2420,
    hemiIntensity: 0.95,
    fog: 0x262a40,
    exposure: 1.4,
    night: 1,
  },
  {
    hour: 24,
    skyTop: 0x060a18,
    horizon: 0x24304a,
    sun: 0x9fb2ff,
    sunIntensity: 0.45,
    hemiSky: 0x5a6aa0,
    hemiGround: 0x2a2420,
    hemiIntensity: 1.0,
    fog: 0x1c2234,
    exposure: 1.45,
    night: 1,
  },
];

const ca = new THREE.Color();
const cb = new THREE.Color();
function mixColor(a: number, b: number, t: number, out: THREE.Color) {
  return out.copy(ca.setHex(a)).lerp(cb.setHex(b), t);
}

/**
 * Sky dome, sun (shadow-casting, follows the player), hemisphere fill, fog and a
 * day–night cycle. One in-game day = 48 real minutes by default.
 */
export class Environment {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private sky: THREE.Mesh;
  private skyColors: THREE.BufferAttribute;
  private skyHeights: Float32Array;
  private fog: THREE.Fog;
  private skyTop = new THREE.Color();
  private horizon = new THREE.Color();
  private updateTimer = 0;
  hour: number;
  /** Game hours per real second (default: 24h in 48 min). */
  timeScale = 24 / (48 * 60);
  night = 0;
  exposure = 1;

  constructor(
    private scene: THREE.Scene,
    preset: QualityPreset,
    startHour = 17.2,
  ) {
    this.hour = startHour;
    this.fog = new THREE.Fog(0xeab088, 45, preset.chunkRadius >= 4 ? 260 : 190);
    scene.fog = this.fog;

    this.hemi = new THREE.HemisphereLight(0xffd0a0, 0x4c3a2c, 1.2);
    this.group.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffa860, 2.6);
    this.sun.castShadow = preset.shadows;
    this.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    const c = this.sun.shadow.camera;
    const r = preset.shadowMapSize >= 2048 ? 38 : 26;
    c.left = -r;
    c.right = r;
    c.top = r;
    c.bottom = -r;
    c.near = 1;
    c.far = 160;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.group.add(this.sun, this.sun.target);

    // Sky dome with a vertical gradient (vertex colours, updated a few times per second).
    const geo = new THREE.SphereGeometry(480, 24, 12);
    const pos = geo.getAttribute('position');
    this.skyHeights = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) this.skyHeights[i] = Math.max(0, pos.getY(i) / 480);
    this.skyColors = new THREE.Float32BufferAttribute(new Float32Array(pos.count * 3), 3);
    geo.setAttribute('color', this.skyColors);
    this.sky = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      }),
    );
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
    scene.add(this.group);
    this.apply(true);
  }

  private sample(): Key {
    const h = ((this.hour % 24) + 24) % 24;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1]!.hour <= h) i++;
    const a = KEYS[i]!;
    const b = KEYS[i + 1]!;
    const t = (h - a.hour) / (b.hour - a.hour);
    const s = t * t * (3 - 2 * t);
    const mix = (x: number, y: number) => x + (y - x) * s;
    const col = (x: number, y: number) => mixColor(x, y, s, new THREE.Color()).getHex();
    return {
      hour: h,
      skyTop: col(a.skyTop, b.skyTop),
      horizon: col(a.horizon, b.horizon),
      sun: col(a.sun, b.sun),
      sunIntensity: mix(a.sunIntensity, b.sunIntensity),
      hemiSky: col(a.hemiSky, b.hemiSky),
      hemiGround: col(a.hemiGround, b.hemiGround),
      hemiIntensity: mix(a.hemiIntensity, b.hemiIntensity),
      fog: col(a.fog, b.fog),
      exposure: mix(a.exposure, b.exposure),
      night: mix(a.night, b.night),
    };
  }

  private apply(force = false) {
    const k = this.sample();
    this.sun.color.setHex(k.sun);
    this.sun.intensity = k.sunIntensity;
    this.hemi.color.setHex(k.hemiSky);
    this.hemi.groundColor.setHex(k.hemiGround);
    this.hemi.intensity = k.hemiIntensity;
    this.fog.color.setHex(k.fog);
    this.night = k.night;
    this.exposure = k.exposure;
    this.skyTop.setHex(k.skyTop);
    this.horizon.setHex(k.horizon);
    const arr = this.skyColors.array as Float32Array;
    const tmp = new THREE.Color();
    for (let i = 0; i < this.skyHeights.length; i++) {
      tmp.copy(this.horizon).lerp(this.skyTop, Math.pow(this.skyHeights[i]!, 0.6));
      arr[i * 3] = tmp.r;
      arr[i * 3 + 1] = tmp.g;
      arr[i * 3 + 2] = tmp.b;
    }
    this.skyColors.needsUpdate = true;
    if (force) this.scene.background = null;
  }

  /** Sun direction from the hour: rises in the east (+X), sets in the west. */
  private sunDirection(out: THREE.Vector3): THREE.Vector3 {
    const h = ((this.hour % 24) + 24) % 24;
    const dayT = (h - 6) / 12; // 0 sunrise .. 1 sunset
    const isDay = dayT > 0 && dayT < 1;
    const angle = isDay ? dayT * Math.PI : (((h < 6 ? h + 24 : h) - 18) / 12) * Math.PI; // moon at night
    const elev = Math.max(0.12, Math.sin(angle)) * (isDay ? 1 : 0.8);
    return out.set(Math.cos(angle) * 0.85, elev, 0.45).normalize();
  }

  update(dt: number, focus: THREE.Vector3, camera: THREE.Camera) {
    this.hour = (this.hour + dt * this.timeScale) % 24;
    this.updateTimer -= dt;
    if (this.updateTimer <= 0) {
      this.apply();
      this.updateTimer = 0.25;
    }
    const dir = this.sunDirection(new THREE.Vector3());
    // Snap the shadow camera to texel-ish steps to avoid shimmering while moving.
    const snap = 0.5;
    const fx = Math.round(focus.x / snap) * snap;
    const fz = Math.round(focus.z / snap) * snap;
    this.sun.position.set(fx + dir.x * 70, dir.y * 70, fz + dir.z * 70);
    this.sun.target.position.set(fx, 0, fz);
    this.sky.position.copy(camera.position);
  }

  dispose() {
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.sun.dispose();
    this.hemi.dispose();
    this.scene.remove(this.group);
  }
}
