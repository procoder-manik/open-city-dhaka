import type { Action, InputDevice, Vec2 } from './actions';

const KEY_BINDINGS: Record<string, Action> = {
  Space: 'jump',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  KeyC: 'crouch',
  KeyF: 'interact',
  KeyR: 'reload',
  KeyQ: 'melee',
  Escape: 'pause',
  KeyP: 'pause',
  KeyH: 'horn',
  KeyX: 'weapon',
  Tab: 'weapon',
  KeyG: 'throw',
};

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

/** Standard gamepad layout → action. */
const GAMEPAD_BINDINGS: Array<[number, Action]> = [
  [0, 'jump'],
  [1, 'crouch'],
  [2, 'reload'],
  [3, 'interact'],
  [5, 'melee'],
  [6, 'aim'],
  [7, 'fire'],
  [10, 'sprint'],
  [9, 'pause'],
  [4, 'horn'],
  [12, 'weapon'],
  [13, 'throw'],
];

const DEADZONE = 0.15;
const deadzone = (v: number) => (Math.abs(v) < DEADZONE ? 0 : v);

export interface InputOptions {
  mouseSensitivity?: number;
  touchSensitivity?: number;
  gamepadLookSpeed?: number;
  onDeviceChange?: (device: InputDevice) => void;
}

/**
 * Unifies keyboard/mouse, touch (fed by the HUD's virtual controls) and gamepad
 * into one action state, sampled once per frame with `update()`.
 */
export class InputManager {
  private keys = new Set<string>();
  private touchButtons = new Set<Action>();
  /** Actions started since the last update — so taps shorter than one frame are never lost. */
  private tapped = new Set<Action>();
  private gamepadButtons = new Set<Action>();
  private down = new Set<Action>();
  private prevDown = new Set<Action>();
  private touchMove: Vec2 = { x: 0, y: 0 };
  /** Touch pedals (vehicle gas/brake), added to move.y. */
  private touchThrottle = 0;
  private lookAccum: Vec2 = { x: 0, y: 0 };
  private gamepadMove: Vec2 = { x: 0, y: 0 };
  private gamepadLook: Vec2 = { x: 0, y: 0 };
  private device: InputDevice = 'keyboard';
  private disposers: Array<() => void> = [];
  private readonly mouseSensitivity: number;
  private readonly touchSensitivity: number;
  private readonly gamepadLookSpeed: number;
  private readonly onDeviceChange: ((d: InputDevice) => void) | undefined;

  /** Movement this frame: x = strafe right, y = forward. Length ≤ 1. */
  readonly move: Vec2 = { x: 0, y: 0 };
  /** Look delta this frame in radians: x = yaw, y = pitch. */
  readonly look: Vec2 = { x: 0, y: 0 };

  constructor(
    private readonly target: HTMLElement,
    options: InputOptions = {},
    initialDevice: InputDevice = 'keyboard',
  ) {
    this.device = initialDevice;
    this.mouseSensitivity = options.mouseSensitivity ?? 0.0025;
    this.touchSensitivity = options.touchSensitivity ?? 0.006;
    this.gamepadLookSpeed = options.gamepadLookSpeed ?? 3;
    this.onDeviceChange = options.onDeviceChange;

    this.listen(window, 'keydown', (e) => this.onKey(e as KeyboardEvent, true));
    this.listen(window, 'keyup', (e) => this.onKey(e as KeyboardEvent, false));
    this.listen(window, 'blur', () => this.clear());
    this.listen(document, 'mousemove', (e) => this.onMouseMove(e as MouseEvent));
    this.listen(target, 'mousedown', (e) => this.onMouseButton(e as MouseEvent, true));
    this.listen(window, 'mouseup', (e) => this.onMouseButton(e as MouseEvent, false));
    // Any real finger touch switches the HUD to touch controls (touch laptops, tablets).
    this.listen(window, 'pointerdown', (e) => {
      if ((e as PointerEvent).pointerType === 'touch') this.setDevice('touch');
    });
  }

  private listen(t: EventTarget, type: string, fn: (e: Event) => void) {
    t.addEventListener(type, fn);
    this.disposers.push(() => t.removeEventListener(type, fn));
  }

  private setDevice(d: InputDevice) {
    if (this.device !== d) {
      this.device = d;
      this.onDeviceChange?.(d);
    }
  }

  get lastDevice(): InputDevice {
    return this.device;
  }

  private onKey(e: KeyboardEvent, isDown: boolean) {
    if (e.repeat) return;
    const known = e.code in KEY_BINDINGS || e.code in MOVE_KEYS;
    if (!known) return;
    if (isDown) {
      this.keys.add(e.code);
      const a = KEY_BINDINGS[e.code];
      if (a) this.tapped.add(a);
    } else {
      this.keys.delete(e.code);
    }
    if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) e.preventDefault();
    this.setDevice('keyboard');
  }

  private onMouseMove(e: MouseEvent) {
    if (document.pointerLockElement !== this.target) return;
    this.lookAccum.x += e.movementX * this.mouseSensitivity;
    this.lookAccum.y += e.movementY * this.mouseSensitivity;
    this.setDevice('keyboard');
  }

  private onMouseButton(e: MouseEvent, isDown: boolean) {
    if (e.button !== 0 && e.button !== 2) return;
    const code = `Mouse${e.button}`;
    if (isDown) {
      this.keys.add(code);
      this.tapped.add(e.button === 0 ? 'fire' : 'aim');
      this.setDevice('keyboard');
    } else {
      this.keys.delete(code);
    }
  }

  // ---- Touch API (called by the HUD's virtual joystick / buttons) ----

  setTouchMove(x: number, y: number) {
    this.touchMove.x = x;
    this.touchMove.y = y;
    if (x !== 0 || y !== 0) this.setDevice('touch');
  }

  /** Touch gas (+1) / brake-reverse (-1) pedals for vehicles. */
  setTouchThrottle(v: number) {
    this.touchThrottle = Math.max(-1, Math.min(1, v));
    if (v !== 0) this.setDevice('touch');
  }

  addTouchLook(dxPixels: number, dyPixels: number) {
    this.lookAccum.x += dxPixels * this.touchSensitivity;
    this.lookAccum.y += dyPixels * this.touchSensitivity;
    this.setDevice('touch');
  }

  setTouchButton(action: Action, isDown: boolean) {
    if (isDown) {
      this.touchButtons.add(action);
      this.tapped.add(action);
      this.setDevice('touch');
    } else {
      this.touchButtons.delete(action);
    }
  }

  private pollGamepad(dt: number) {
    this.gamepadButtons.clear();
    this.gamepadMove.x = this.gamepadMove.y = 0;
    this.gamepadLook.x = this.gamepadLook.y = 0;
    if (typeof navigator.getGamepads !== 'function') return;
    const pad = Array.from(navigator.getGamepads()).find((p) => p?.connected);
    if (!pad) return;
    const ax = (i: number) => deadzone(pad.axes[i] ?? 0);
    this.gamepadMove.x = ax(0);
    this.gamepadMove.y = -ax(1);
    this.gamepadLook.x = ax(2) * this.gamepadLookSpeed * dt;
    this.gamepadLook.y = ax(3) * this.gamepadLookSpeed * dt;
    for (const [i, a] of GAMEPAD_BINDINGS) if (pad.buttons[i]?.pressed) this.gamepadButtons.add(a);
    const active =
      this.gamepadButtons.size > 0 ||
      this.gamepadMove.x !== 0 ||
      this.gamepadMove.y !== 0 ||
      this.gamepadLook.x !== 0 ||
      this.gamepadLook.y !== 0;
    if (active) this.setDevice('gamepad');
  }

  /** Call once per frame before game logic. */
  update(dt: number) {
    this.pollGamepad(dt);

    let mx = this.touchMove.x + this.gamepadMove.x;
    let my = this.touchMove.y + this.gamepadMove.y + this.touchThrottle;
    for (const code of this.keys) {
      const m = MOVE_KEYS[code];
      if (m) {
        mx += m[0];
        my += m[1];
      }
    }
    const len = Math.hypot(mx, my);
    this.move.x = len > 1 ? mx / len : mx;
    this.move.y = len > 1 ? my / len : my;

    this.look.x = this.lookAccum.x + this.gamepadLook.x;
    this.look.y = this.lookAccum.y + this.gamepadLook.y;
    this.lookAccum.x = this.lookAccum.y = 0;

    const prev = this.prevDown;
    this.prevDown = this.down;
    this.down = prev;
    this.down.clear();
    for (const code of this.keys) {
      const a = KEY_BINDINGS[code];
      if (a) this.down.add(a);
    }
    if (this.keys.has('Mouse0')) this.down.add('fire');
    if (this.keys.has('Mouse2')) this.down.add('aim');
    for (const a of this.touchButtons) this.down.add(a);
    for (const a of this.gamepadButtons) this.down.add(a);
    for (const a of this.tapped) this.down.add(a);
    this.tapped.clear();
  }

  isDown(a: Action): boolean {
    return this.down.has(a);
  }

  /** True only on the frame the action started. */
  pressed(a: Action): boolean {
    return this.down.has(a) && !this.prevDown.has(a);
  }

  clear() {
    this.keys.clear();
    this.tapped.clear();
    this.touchButtons.clear();
    this.touchMove.x = this.touchMove.y = 0;
    this.touchThrottle = 0;
    this.lookAccum.x = this.lookAccum.y = 0;
  }

  dispose() {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.clear();
  }
}
