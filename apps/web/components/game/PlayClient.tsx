'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { QUALITY_TIERS, brand, type QualityTier } from '@game/shared';
import type * as Engine from '@game/engine';
import type { Game, GameLock, GameState, TalkOption } from '@game/engine';
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
      await boot(mod, container, tier);
    } catch (err) {
      await lock.exit();
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }, [tier, togglePause]); // eslint-disable-line react-hooks/exhaustive-deps

  async function boot(mod: EngineModule, container: HTMLElement, t: TierChoice) {
    const banglaFont = getComputedStyle(document.documentElement)
      .getPropertyValue('--font-bangla')
      .trim();
    const g = await mod.createGame({
      container,
      ...(t === 'auto' ? {} : { tier: t }),
      ...(banglaFont ? { banglaFont } : {}),
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
  }

  /** Switch graphics quality from the pause menu: rebuild the game with the new preset. */
  const changeTier = useCallback(
    async (t: TierChoice) => {
      const mod = engineRef.current;
      const container = containerRef.current;
      if (!mod || !container) return;
      saveTier(t);
      setTier(t);
      gameRef.current?.dispose();
      gameRef.current = null;
      setGame(null);
      setPhase('loading');
      try {
        await boot(mod, container, t);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

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
                WASD হাঁটা · মাউস দেখা · Shift দৌড় · Space লাফ · F গাড়িতে ওঠা · Esc পজ
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
          tier={tier}
          onPause={togglePause}
          onResume={resume}
          onExit={exitToMenu}
          onChangeTier={changeTier}
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

function formatHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return h12 + ':' + String(mm).padStart(2, '0') + (hh < 12 ? ' AM' : ' PM');
}

function GameHud({
  game,
  isTouch,
  tier,
  onPause,
  onResume,
  onExit,
  onChangeTier,
}: {
  game: Game;
  isTouch: boolean;
  tier: TierChoice;
  onPause: () => void;
  onResume: () => void;
  onExit: () => void;
  onChangeTier: (t: TierChoice) => void;
}) {
  const status = useGame(game, (s) => s.status);
  const lastInput = useGame(game, (s) => s.lastInput);
  const mode = useGame(game, (s) => s.mode);
  const prompt = useGame(game, (s) => s.prompt);
  const speed = useGame(game, (s) => s.speedKmh);
  const hour = useGame(game, (s) => Math.floor(s.hour * 6) / 6);
  const activeTier = useGame(game, (s) => s.tier);
  const taka = useGame(game, (s) => s.taka);
  const notoriety = useGame(game, (s) => s.notoriety);
  const publicLove = useGame(game, (s) => s.publicLove);
  const subtitle = useGame(game, (s) => s.subtitle);
  const talk = useGame(game, (s) => s.talk);
  const fuel = useGame(game, (s) => Math.round(s.fuel * 100));
  const damage = useGame(game, (s) => s.damage);
  const zones = useGame(game, (s) => s.damageZones);
  const engineDead = useGame(game, (s) => s.engineDead);
  const muted = useGame(game, (s) => s.muted);
  const voiceMode = useGame(game, (s) => s.voiceMode);
  const voiceEffective = useGame(game, (s) => s.voiceEffective);
  const [showStats, setShowStats] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug'),
  );
  const [showHelp, setShowHelp] = useState(false);
  // Phones/tablets always; touch laptops once the screen is touched; hidden while using a gamepad.
  const showTouch = (isTouch || lastInput === 'touch') && lastInput !== 'gamepad';
  const interactLabel = prompt ? (mode === 'vehicle' ? 'নামো' : 'উঠো') : null;

  // Number keys 1–5 pick talk options (desktop).
  useEffect(() => {
    if (!talk || status !== 'running') return;
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      const opt = talk.options[i];
      if (opt && !e.repeat) game.chooseTalk(opt.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [talk, status, game]);

  const zoneColor = (d: number) =>
    d < 15 ? '#4caf50' : d < 45 ? '#cddc39' : d < 75 ? '#ff9800' : '#f44336';

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

      <div className={styles.clock} data-testid="clock" data-status={status}>
        {formatHour(hour)}
      </div>

      <div className={styles.wallet} data-testid="wallet">
        <span className={styles.taka}>৳{taka.toLocaleString('bn-BD')}</span>
        <span title="কুখ্যাতি">😈 {notoriety}</span>
        <span title="জনপ্রিয়তা">❤️ {publicLove}</span>
      </div>

      {mode === 'vehicle' && (
        <div className={styles.dash} data-testid="speedo">
          <div className={styles.dashSpeed}>
            <b>{speed}</b>
            <span>km/h</span>
          </div>
          <div className={styles.dashCol}>
            <div className={styles.gaugeLabel}>
              ⛽ জ্বালানি <b>{fuel}%</b>
            </div>
            <div className={styles.bar}>
              <div
                className={styles.barFill}
                style={{ width: `${fuel}%`, background: fuel < 15 ? '#f44336' : '#2ec4b6' }}
              />
            </div>
            <div className={styles.gaugeLabel}>
              🔧 ড্যামেজ <b data-testid="damage">{damage}%</b>
              {engineDead && <em className={styles.dead}> ইঞ্জিন বন্ধ!</em>}
            </div>
          </div>
          <svg className={styles.carDiagram} viewBox="0 0 40 64" aria-label="Damage by zone">
            <rect x="8" y="2" width="24" height="14" rx="5" fill={zoneColor(zones.front)} />
            <rect x="8" y="48" width="24" height="14" rx="5" fill={zoneColor(zones.rear)} />
            <rect x="32" y="16" width="6" height="32" rx="3" fill={zoneColor(zones.left)} />
            <rect x="2" y="16" width="6" height="32" rx="3" fill={zoneColor(zones.right)} />
            <rect x="10" y="18" width="20" height="28" rx="4" fill="rgba(255,255,255,0.15)" />
          </svg>
        </div>
      )}

      {subtitle && (
        <div className={styles.subtitle} data-testid="subtitle">
          <b style={{ color: subtitle.color }}>{subtitle.name}:</b> {subtitle.text}
          <small>{subtitle.en}</small>
        </div>
      )}

      {talk && status === 'running' && mode === 'foot' && (
        <div className={styles.talkMenu} data-testid="talk-menu">
          <div className={styles.talkName}>{talk.name}</div>
          {talk.options.map((o, i) => (
            <button
              key={o.id}
              type="button"
              className={styles.talkBtn}
              data-testid={`talk-${o.id}`}
              onClick={() => game.chooseTalk(o.id as TalkOption)}
            >
              {!showTouch && <kbd>{i + 1}</kbd>}
              {o.label}
            </button>
          ))}
        </div>
      )}

      {prompt && !showTouch && status === 'running' && (
        <div className={styles.prompt} data-testid="prompt">
          <kbd>{lastInput === 'gamepad' ? 'Y' : 'F'}</kbd>
          {prompt}
        </div>
      )}

      {showTouch && status === 'running' && (
        <TouchControls input={game.input} mode={mode} interactLabel={interactLabel} />
      )}

      {status === 'paused' && (
        <div className={styles.overlay}>
          <div className={`panel ${styles.startCard}`}>
            <h2 className={styles.title}>Paused</h2>
            <button className="btn" type="button" onClick={onResume} data-testid="resume-btn">
              চালিয়ে যাও ▶
            </button>
            <p className={styles.muted}>গ্রাফিক্স (এখন: {activeTier})</p>
            <div className={styles.menuRow} role="group" aria-label="Graphics quality">
              {(['auto', ...QUALITY_TIERS] as TierChoice[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`${styles.chip} ${tier === t ? styles.chipActive : ''}`}
                  onClick={() => onChangeTier(t)}
                >
                  {t === 'auto' ? 'Auto' : t[0]!.toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div className={styles.menuRow}>
              <button className={styles.chip} type="button" onClick={() => setShowHelp((v) => !v)}>
                কন্ট্রোল {showHelp ? '▲' : '▼'}
              </button>
              <button className={styles.chip} type="button" onClick={() => setShowStats((v) => !v)}>
                FPS {showStats ? 'বন্ধ' : 'চালু'}
              </button>
              <button
                className={styles.chip}
                type="button"
                onClick={() => game.setMuted(!muted)}
                data-testid="mute-btn"
              >
                {muted ? '🔇 সাউন্ড চালু করো' : '🔊 সাউন্ড বন্ধ করো'}
              </button>
            </div>
            <p className={styles.muted}>
              কণ্ঠ (এখন:{' '}
              {voiceEffective === 'recorded'
                ? 'AI ভয়েস ফাইল'
                : voiceEffective === 'device'
                  ? 'ডিভাইসের AI ভয়েস'
                  : 'শুধু লেখা'}
              )
            </p>
            <div className={styles.menuRow} role="group" aria-label="Voice">
              {(
                [
                  ['auto', 'Auto'],
                  ['device', 'ডিভাইস AI'],
                  ['off', 'বন্ধ'],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  className={`${styles.chip} ${voiceMode === m ? styles.chipActive : ''}`}
                  onClick={() => game.setVoiceMode(m)}
                  data-testid={`voice-${m}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {showHelp && (
              <dl className={styles.help}>
                <dt>হাঁটা</dt>
                <dd>WASD / জয়স্টিক</dd>
                <dt>দৌড়</dt>
                <dd>Shift / জয়স্টিক পুরো ঠেলো</dd>
                <dt>লাফ</dt>
                <dd>Space / ⤒</dd>
                <dt>গাড়িতে ওঠা/নামা</dt>
                <dd>F / উঠো-নামো বাটন</dd>
                <dt>গাড়ি চালানো</dt>
                <dd>W/S গ্যাস-ব্রেক, A/D স্টিয়ার, Space হ্যান্ডব্রেক</dd>
                <dt>মোবাইলে গাড়ি</dt>
                <dd>জয়স্টিকে স্টিয়ার, ▲ গ্যাস, ▼ ব্রেক, HB হ্যান্ডব্রেক</dd>
                <dt>হর্ন</dt>
                <dd>H / 📯 বাটন</dd>
                <dt>কথা বলা</dt>
                <dd>কারো কাছে গিয়ে 1–5 / মেনু বাটন</dd>
                <dt>ক্যামেরা</dt>
                <dd>মাউস / ডান দিকে আঙুল টানো</dd>
              </dl>
            )}
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
