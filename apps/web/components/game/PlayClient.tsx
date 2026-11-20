'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { QUALITY_TIERS, brand, type QualityTier } from '@game/shared';
import type * as Engine from '@game/engine';
import type { Game, GameLock, GameState } from '@game/engine';
import { TouchControls } from './TouchControls';
import styles from './play.module.css';

type EngineModule = typeof Engine;
type Phase = 'start' | 'loading' | 'playing' | 'error';
type TierChoice = QualityTier | 'auto';

const TIER_KEY = 'gfx.tier';

function readTier(): TierChoice {
  try {
    const v = localStorage.getItem(TIER_KEY);
    return v && (QUALITY_TIERS as readonly string[]).includes(v) ? (v as QualityTier) : 'auto';
  } catch {
    return 'auto';
  }
}

function saveTier(t: TierChoice) {
  try {
    if (t === 'auto') localStorage.removeItem(TIER_KEY);
    else localStorage.setItem(TIER_KEY, t);
  } catch {
    /* storage unavailable (private mode) */
  }
}

export function PlayClient() {
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<EngineModule | null>(null);
  const lockRef = useRef<GameLock | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [phase, setPhase] = useState<Phase>('start');
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState<TierChoice>('auto');
  const [engineReady, setEngineReady] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [iosBrowser, setIosBrowser] = useState(false);
  const [allowPortrait, setAllowPortrait] = useState(false);

  // Preload the engine while the player looks at the start screen, so the Play tap
  // can go fullscreen immediately (browsers require it inside the user gesture).
  useEffect(() => {
    setTier(readTier());
    let cancelled = false;
    import('@game/engine')
      .then((mod) => {
        if (cancelled) return;
        engineRef.current = mod;
        const d = mod.detectDevice();
        setIsTouch(d.formFactor !== 'desktop');
        setIosBrowser(d.ios && !d.standalone);
        setEngineReady(true);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const gameRef = useRef<Game | null>(null);

  /** Pause requests come from Esc, back gesture, tab hide, pointer-lock loss or the HUD button. */
  const togglePause = useCallback(() => {
    const g = gameRef.current;
    if (g && g.store.getState().status === 'running') g.pause();
  }, []);

  const start = useCallback(async () => {
    const mod = engineRef.current;
    const root = rootRef.current;
    const container = containerRef.current;
    if (!mod || !root || !container) return;

    const lock = new mod.GameLock(root, { onBackRequest: togglePause, onHidden: togglePause });
    lockRef.current = lock;
    // Started synchronously inside the tap (browsers require a user gesture for fullscreen).
    // Never awaited before boot: a pending permission prompt must not block the game.
    void lock.enter();
    setPhase('loading');
    try {
      const g = await mod.createGame({
        container,
        ...(tier === 'auto' ? {} : { tier }),
        onPauseRequest: togglePause,
        createPhysicsWorker: () =>
          new Worker(new URL('../../workers/physics.worker.ts', import.meta.url), {
            type: 'module',
          }),
      });
      gameRef.current = g;
      if (new URLSearchParams(window.location.search).has('debug')) {
        (window as unknown as { __game?: Game }).__game = g;
      }
      setGame(g);
      setPhase('playing');
    } catch (err) {
      await lock.exit();
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }, [tier, togglePause]);

  const resume = useCallback(async () => {
    if (!game) return;
    await lockRef.current?.refresh();
    lockRef.current?.requestPointerLock(game.canvas);
    game.resume();
  }, [game]);

  const exitToMenu = useCallback(async () => {
    game?.dispose();
    await lockRef.current?.exit({ navigatingAway: true });
    window.location.replace('/');
  }, [game]);

  useEffect(() => () => game?.dispose(), [game]);

  return (
    <div ref={rootRef} className={`play-root ${allowPortrait ? styles.allowPortrait : ''}`}>
      <div
        ref={containerRef}
        className="game-container"
        onClick={() => game && lockRef.current?.requestPointerLock(game.canvas)}
      />

      {phase === 'start' && (
        <div className={styles.overlay}>
          <div className={`panel ${styles.startCard}`}>
            <p className={styles.edition}>{brand.editionName}</p>
            <h1 className={styles.title}>{brand.displayName}</h1>
            <p className={styles.muted}>{brand.taglineBn}</p>
            <button
              className="btn"
              type="button"
              onClick={start}
              disabled={!engineReady}
              data-testid="play-btn"
            >
              {engineReady ? 'খেলা শুরু ▶' : 'লোড হচ্ছে…'}
            </button>
            <label className={styles.field}>
              গ্রাফিক্স
              <select
                value={tier}
                onChange={(e) => {
                  const t = e.target.value as TierChoice;
                  setTier(t);
                  saveTier(t);
                }}
              >
                <option value="auto">Auto (recommended)</option>
                {QUALITY_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t[0]!.toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            {iosBrowser && (
              <p className={styles.tip}>
                iPhone-এ ফুল স্ক্রিনের জন্য: Share → <b>Add to Home Screen</b>, তারপর আইকন থেকে খোলো।
              </p>
            )}
            {!isTouch && engineReady && (
              <p className={styles.tip}>
                WASD হাঁটা · মাউস দিয়ে দেখা · Shift দৌড় · Space লাফ · Esc পজ
              </p>
            )}
          </div>
        </div>
      )}

      {phase === 'loading' && (
        <div className={styles.overlay}>
          <div className={styles.loader} aria-live="polite">
            <div className={styles.spinner} />
            <p>মোহাম্মদপুর লোড হচ্ছে…</p>
            <p className={styles.muted}>টিপস: জ্যামে আটকালে হর্ন দিয়ে লাভ নাই 😄</p>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className={styles.overlay}>
          <div className={`panel ${styles.startCard}`} role="alert">
            <h2>কিছু একটা গড়বড় হয়েছে</h2>
            <p className={styles.muted}>{error}</p>
            <button className="btn" type="button" onClick={() => window.location.reload()}>
              আবার চেষ্টা করো
            </button>
          </div>
        </div>
      )}

      {phase === 'playing' && game && (
        <GameHud
          game={game}
          isTouch={isTouch}
          onPause={togglePause}
          onResume={resume}
          onExit={exitToMenu}
        />
      )}

      {phase === 'playing' && !allowPortrait && (
        <div className={styles.rotateHint}>
          <div className={styles.rotateIcon}>📱↻</div>
          <p>ফোনটা আড়াআড়ি করো</p>
          <button className="btn secondary" type="button" onClick={() => setAllowPortrait(true)}>
            খাড়া করেই খেলবো
          </button>
        </div>
      )}
    </div>
  );
}

function useGame<T>(game: Game, selector: (s: GameState) => T): T {
  return useStore(game.store, selector);
}

function GameHud({
  game,
  isTouch,
  onPause,
  onResume,
  onExit,
}: {
  game: Game;
  isTouch: boolean;
  onPause: () => void;
  onResume: () => void;
  onExit: () => void;
}) {
  const status = useGame(game, (s) => s.status);
  const lastInput = useGame(game, (s) => s.lastInput);
  const [showStats, setShowStats] = useState(true);
  // Phones/tablets always; touch laptops once the screen is touched; hidden while using a gamepad.
  const showTouch = (isTouch || lastInput === 'touch') && lastInput !== 'gamepad';

  return (
    <>
      {showStats && <StatsOverlay game={game} onClick={() => setShowStats(false)} />}
      {!showStats && (
        <button
          type="button"
          className={styles.statsToggle}
          onClick={() => setShowStats(true)}
          aria-label="Show stats"
        >
          i
        </button>
      )}

      <button
        type="button"
        className={styles.pauseBtn}
        onClick={onPause}
        aria-label="Pause"
        data-testid="pause-btn"
      >
        ❚❚
      </button>

      {showTouch && status === 'running' && <TouchControls input={game.input} />}

      {status === 'paused' && (
        <div className={styles.overlay}>
          <div className={`panel ${styles.startCard}`}>
            <h2 className={styles.title}>Paused</h2>
            <button className="btn" type="button" onClick={onResume} data-testid="resume-btn">
              চালিয়ে যাও ▶
            </button>
            <button className="btn secondary" type="button" onClick={onExit}>
              মেনুতে ফিরে যাও
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function StatsOverlay({ game, onClick }: { game: Game; onClick: () => void }) {
  const s = useGame(game, (st) => st);
  return (
    <button
      type="button"
      className={styles.stats}
      onClick={onClick}
      data-testid="stats"
      data-status={s.status}
    >
      <span>
        <b>{s.fps}</b> fps · {s.frameMs} ms
      </span>
      <span>
        {s.backend} · {s.tier} · {Math.round(s.resolutionScale * 100)}%
      </span>
      <span>
        {s.drawCalls} calls · {(s.triangles / 1000).toFixed(1)}k tris
      </span>
      <span>
        physics: {s.physicsMode} · input: {s.lastInput}
      </span>
    </button>
  );
}
