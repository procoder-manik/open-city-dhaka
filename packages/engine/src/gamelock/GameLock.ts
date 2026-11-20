/**
 * "Game Lock": keeps the player inside the game on every device.
 * - Fullscreen + landscape lock (Android/desktop; iOS uses the installed PWA instead)
 * - Screen stays awake
 * - Back button / back swipe opens pause instead of leaving
 * - No pinch/double-tap zoom, long-press menu, text selection or pull-to-refresh
 * - Desktop: pointer lock for mouse look, Esc captured (hold Esc to leave fullscreen)
 *
 * Every API is optional in some browser, so each step fails silently.
 */
export interface GameLockOptions {
  /** Called when the player tries to leave (back gesture, Esc release of pointer lock). */
  onBackRequest?: () => void;
  /** Called when the tab is hidden (pause the game). */
  onHidden?: () => void;
  /** Ask before closing the tab while playing. */
  confirmLeave?: boolean;
}

export interface GameLockStatus {
  fullscreen: boolean;
  orientationLocked: boolean;
  wakeLock: boolean;
}

/** Browser permission prompts can leave these promises pending forever — never block the game on them. */
const STEP_TIMEOUT_MS = 1500;
function withTimeout<T>(p: Promise<T>, ms = STEP_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

type WakeLockSentinelLike = { release(): Promise<void>; released?: boolean };
type OrientationLike = ScreenOrientation & { lock?: (o: string) => Promise<void> };
type KeyboardLike = { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void };

export class GameLock {
  private active = false;
  private wakeLock: WakeLockSentinelLike | null = null;
  private disposers: Array<() => void> = [];
  readonly status: GameLockStatus = {
    fullscreen: false,
    orientationLocked: false,
    wakeLock: false,
  };

  constructor(
    private readonly root: HTMLElement,
    private readonly opts: GameLockOptions = {},
  ) {}

  get isActive(): boolean {
    return this.active;
  }

  /** Must be called from a user gesture (tap/click), browsers require it for fullscreen. */
  async enter(): Promise<GameLockStatus> {
    if (this.active) return this.status;
    this.active = true;
    document.documentElement.classList.add('game-locked');

    await this.requestFullscreen();
    await this.lockOrientation();
    await this.requestWakeLock();
    await this.lockKeyboard();
    this.trapHistory();
    this.blockGestures();
    this.watchVisibility();
    if (this.opts.confirmLeave !== false) this.confirmBeforeUnload();
    return this.status;
  }

  /** Re-acquire fullscreen/orientation/wake lock after resume (call from a user gesture). */
  async refresh(): Promise<GameLockStatus> {
    if (!this.active) return this.status;
    await this.requestFullscreen();
    await this.lockOrientation();
    if (!this.wakeLock || this.wakeLock.released) await this.requestWakeLock();
    await this.lockKeyboard();
    return this.status;
  }

  /** `navigatingAway`: skip restoring history because the page is about to change. */
  async exit({ navigatingAway = false }: { navigatingAway?: boolean } = {}): Promise<void> {
    if (!this.active) return;
    this.active = false;
    document.documentElement.classList.remove('game-locked');
    for (const d of this.disposers.splice(0)) d();
    (navigator as Navigator & { keyboard?: KeyboardLike }).keyboard?.unlock?.();
    try {
      (screen.orientation as OrientationLike | undefined)?.unlock?.();
    } catch {
      /* not supported */
    }
    await this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
    if (document.pointerLockElement) document.exitPointerLock();
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    if (!navigatingAway && history.state?.gameLock) history.back();
    Object.assign(this.status, { fullscreen: false, orientationLocked: false, wakeLock: false });
  }

  /** Desktop mouse look. Call from a click on the canvas. */
  requestPointerLock(canvas: HTMLElement) {
    if (matchMedia('(pointer: coarse)').matches) return;
    try {
      const p = canvas.requestPointerLock() as unknown;
      if (p instanceof Promise) p.catch(() => {});
    } catch {
      /* ignore */
    }
  }

  private async requestFullscreen() {
    if (document.fullscreenElement || !this.root.requestFullscreen) {
      this.status.fullscreen = !!document.fullscreenElement;
      return;
    }
    try {
      await withTimeout(this.root.requestFullscreen({ navigationUI: 'hide' }));
      this.status.fullscreen = true;
    } catch {
      this.status.fullscreen = false;
    }
  }

  private async lockOrientation() {
    const o = screen.orientation as OrientationLike | undefined;
    if (!o?.lock || !matchMedia('(pointer: coarse)').matches) return;
    try {
      await withTimeout(o.lock('landscape'));
      this.status.orientationLocked = true;
    } catch {
      this.status.orientationLocked = false;
    }
  }

  private async requestWakeLock() {
    const wl = (
      navigator as Navigator & {
        wakeLock?: { request(t: 'screen'): Promise<WakeLockSentinelLike> };
      }
    ).wakeLock;
    if (!wl) return;
    try {
      this.wakeLock = await withTimeout(wl.request('screen'));
      this.status.wakeLock = true;
    } catch {
      this.status.wakeLock = false;
    }
  }

  private async lockKeyboard() {
    const kb = (navigator as Navigator & { keyboard?: KeyboardLike }).keyboard;
    if (!kb?.lock || !document.fullscreenElement) return;
    try {
      await withTimeout(kb.lock(['Escape']));
    } catch {
      /* not supported */
    }
  }

  private on(
    target: EventTarget,
    type: string,
    fn: (e: Event) => void,
    opts?: AddEventListenerOptions,
  ) {
    target.addEventListener(type, fn, opts);
    this.disposers.push(() => target.removeEventListener(type, fn, opts));
  }

  /** Back button / swipe-back pops our dummy history entry; we re-push it and show pause. */
  private trapHistory() {
    history.pushState({ gameLock: true }, '');
    this.on(window, 'popstate', () => {
      if (!this.active) return;
      history.pushState({ gameLock: true }, '');
      this.opts.onBackRequest?.();
    });
  }

  private blockGestures() {
    const prevent = (e: Event) => e.preventDefault();
    this.on(document, 'contextmenu', prevent);
    this.on(document, 'gesturestart', prevent); // iOS pinch
    this.on(document, 'dblclick', prevent);
    this.on(document, 'selectstart', prevent);
    this.on(
      document,
      'touchmove',
      (e) => {
        if ((e as TouchEvent).touches.length > 1) e.preventDefault();
      },
      { passive: false },
    );
    this.on(document, 'fullscreenchange', () => {
      this.status.fullscreen = !!document.fullscreenElement;
      if (!document.fullscreenElement && this.active) this.opts.onBackRequest?.();
    });
    this.on(document, 'pointerlockchange', () => {
      if (!document.pointerLockElement && this.active && !matchMedia('(pointer: coarse)').matches) {
        this.opts.onBackRequest?.();
      }
    });
  }

  private watchVisibility() {
    this.on(document, 'visibilitychange', () => {
      if (document.hidden) {
        this.opts.onHidden?.();
      } else if (this.active) {
        void this.requestWakeLock(); // wake lock is released when the tab is hidden
      }
    });
  }

  private confirmBeforeUnload() {
    this.on(window, 'beforeunload', (e) => {
      e.preventDefault();
      (e as BeforeUnloadEvent).returnValue = '';
    });
  }
}
