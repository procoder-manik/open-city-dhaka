import { createStore } from 'zustand/vanilla';
import type { QualityTier } from '@game/shared';
import type { InputDevice } from '../input/actions';
import type { HudState } from '../scenes/SliceScene';
import type { VoiceMode } from '../audio/VoicePlayer';

export type GameStatus = 'idle' | 'loading' | 'running' | 'paused' | 'error';

export interface GameState extends HudState {
  status: GameStatus;
  error: string | null;
  backend: 'webgpu' | 'webgl2' | 'unknown';
  tier: QualityTier;
  physicsMode: 'worker' | 'inline' | 'none';
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  resolutionScale: number;
  lastInput: InputDevice;
  muted: boolean;
  voiceMode: VoiceMode;
  voiceEffective: 'recorded' | 'device' | 'off';
  deviceBangla: boolean;
}

/** Shared game state: engine writes, React HUD reads (and vice versa for settings). */
export const createGameStore = (tier: QualityTier) =>
  createStore<GameState>(() => ({
    status: 'idle',
    error: null,
    backend: 'unknown',
    tier,
    physicsMode: 'none',
    fps: 0,
    frameMs: 0,
    drawCalls: 0,
    triangles: 0,
    resolutionScale: 1,
    lastInput: 'keyboard',
    mode: 'foot',
    prompt: null,
    vehicleName: null,
    speedKmh: 0,
    hour: 17,
    taka: 120,
    notoriety: 0,
    publicLove: 0,
    subtitle: null,
    talk: null,
    fuel: 1,
    damage: 0,
    damageZones: { front: 0, rear: 0, left: 0, right: 0 },
    engineDead: false,
    heroFull: 'গ্রেট থিফ মোস্তফা',
    wanted: 0,
    crimes: 0,
    bribeCost: 0,
    headline: null,
    pos: [0, 0],
    health: 100,
    weapon: 'fist',
    weaponName: 'ঘুষি',
    ammo: 0,
    grenades: 0,
    overlay: null,
    arrest: 0,
    hurtId: 0,
    heading: 0,
    area: 'তাজমহল রোড, মোহাম্মদপুর',
    muted: false,
    voiceMode: 'auto',
    voiceEffective: 'off',
    deviceBangla: false,
  }));

export type GameStore = ReturnType<typeof createGameStore>;
