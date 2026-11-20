import * as THREE from 'three/webgpu';
import { Humanoid, NPC_LOOKS } from './Humanoid';

export type NpcKind = 'person' | 'stall' | 'shop';
export type TalkOption = 'greet' | 'threaten' | 'snatch' | 'order' | 'grab';

export const TALK_LABELS: Record<TalkOption, string> = {
  greet: 'সালাম দাও',
  threaten: 'হুমকি দাও',
  snatch: 'ছিনতাই',
  order: 'অর্ডার',
  grab: 'ছিনিয়ে নাও',
};

export interface NpcDef {
  id: string;
  /** Dialogue speaker key + look key. */
  speaker: 'teaChacha' | 'rickshawWala' | 'shopkeeper' | 'foreigner';
  kind: NpcKind;
  position: [number, number, number];
  facing: number;
  /** What ordering costs (stalls/shops). */
  price?: number;
  orderName?: string;
}

/** A standing NPC with idle life, reactions and talk options. */
export class Npc {
  readonly humanoid: Humanoid;
  readonly position: THREE.Vector3;
  wallet: number;
  snatchCooldown = 0;
  barkCooldown = 0;
  idleTimer: number;
  /** 0..1 fear after threats/snatches; makes them flinch. */
  fear = 0;

  constructor(readonly def: NpcDef) {
    this.humanoid = new Humanoid(NPC_LOOKS[def.speaker]);
    this.position = new THREE.Vector3(...def.position);
    this.humanoid.root.position.copy(this.position);
    this.humanoid.root.rotation.y = def.facing;
    this.wallet = 150 + Math.floor(Math.random() * 450);
    this.idleTimer = 6 + Math.random() * 12;
  }

  get options(): TalkOption[] {
    const base: TalkOption[] = ['greet', 'threaten'];
    if (this.def.kind === 'stall' || this.def.kind === 'shop') base.splice(1, 0, 'order', 'grab');
    if (this.snatchCooldown <= 0) base.push('snatch');
    return base;
  }

  update(dt: number, player: THREE.Vector3 | null) {
    this.snatchCooldown = Math.max(0, this.snatchCooldown - dt);
    this.barkCooldown = Math.max(0, this.barkCooldown - dt);
    this.idleTimer -= dt;
    this.fear = Math.max(0, this.fear - dt * 0.1);
    // Turn to face the player when close, otherwise back to their post.
    let targetYaw = this.def.facing;
    if (player && player.distanceTo(this.position) < 5) {
      targetYaw = Math.atan2(player.x - this.position.x, player.z - this.position.z);
    }
    const r = this.humanoid.root;
    let diff = targetYaw - r.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    r.rotation.y += diff * (1 - Math.exp(-4 * dt));
    // Scared NPCs lean back slightly
    r.position.copy(this.position);
    this.humanoid.update(dt, {
      speed: 0,
      distance: 0,
      grounded: true,
      vy: 0,
      turnRate: 0,
      accel: -this.fear * 4,
      riding: false,
    });
  }
}

/** NPCs placed around the Phase 1 street (positions relative to the street layout). */
export function defaultNpcs(roadHalf: number, footWidth: number, curb: number): NpcDef[] {
  const teaX = roadHalf + footWidth - 0.9;
  return [
    {
      id: 'mofiz',
      speaker: 'teaChacha',
      kind: 'stall',
      position: [teaX - 0.15, curb, -10.45],
      facing: -Math.PI / 2,
      price: 10,
      orderName: 'চা',
    },
    {
      id: 'rickshaw1',
      speaker: 'rickshawWala',
      kind: 'person',
      position: [roadHalf - 0.2, 0, -15.6],
      facing: -Math.PI / 2,
    },
    {
      id: 'shop1',
      speaker: 'shopkeeper',
      kind: 'shop',
      position: [roadHalf + footWidth - 0.15, curb, 9.5],
      facing: -Math.PI / 2,
      price: 25,
      orderName: 'কোল্ড ড্রিংক্স',
    },
    {
      id: 'tourist',
      speaker: 'foreigner',
      kind: 'person',
      position: [roadHalf + 1.6, curb, -4.5],
      facing: Math.PI,
    },
  ];
}
