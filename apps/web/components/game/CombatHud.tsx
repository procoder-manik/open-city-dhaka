'use client';

import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import type { Game } from '@game/engine';
import styles from './combat.module.css';

const ICON: Record<string, string> = { fist: '👊', pistol: '🔫', grenade: '💣' };

/** Health, weapon/ammo, arrest bar, hurt flash and the WASTED / BUSTED screen. */
export function CombatHud({ game, touch }: { game: Game; touch: boolean }) {
  const health = useStore(game.store, (s) => s.health);
  const weapon = useStore(game.store, (s) => s.weapon);
  const weaponName = useStore(game.store, (s) => s.weaponName);
  const ammo = useStore(game.store, (s) => s.ammo);
  const grenades = useStore(game.store, (s) => s.grenades);
  const arrest = useStore(game.store, (s) => s.arrest);
  const overlay = useStore(game.store, (s) => s.overlay);
  const hurtId = useStore(game.store, (s) => s.hurtId);
  const mode = useStore(game.store, (s) => s.mode);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    if (!hurtId) return;
    setFlash(hurtId);
    const t = setTimeout(() => setFlash(0), 350);
    return () => clearTimeout(t);
  }, [hurtId]);

  const count = weapon === 'pistol' ? ammo : weapon === 'grenade' ? grenades : null;
  const press = (action: 'fire' | 'weapon' | 'throw' | 'aim', down: boolean) =>
    game.input.setTouchButton(action, down);

  return (
    <>
      <div className={styles.status} data-testid="health">
        <div className={styles.bar} aria-label={`Health ${health}`}>
          <i style={{ width: `${health}%` }} data-low={health < 30 ? '1' : undefined} />
        </div>
        <button
          type="button"
          className={styles.weapon}
          data-testid="weapon"
          onClick={() => {
            press('weapon', true);
            setTimeout(() => press('weapon', false), 60);
          }}
          title="অস্ত্র বদলাও (X)"
        >
          <span>{ICON[weapon]}</span>
          <b>{weaponName}</b>
          {count !== null && <em>{count}</em>}
        </button>
      </div>

      {arrest > 0.05 && !overlay && (
        <div className={styles.arrest} data-testid="arrest">
          <span>পুলিশ ধরতেছে! পালাও!</span>
          <div>
            <i style={{ width: `${arrest * 100}%` }} />
          </div>
        </div>
      )}

      {flash > 0 && <div className={styles.hurt} />}

      {overlay && (
        <div className={styles.overlay} data-kind={overlay.kind} data-testid="overlay">
          <h2>{overlay.title}</h2>
          <p>{overlay.sub}</p>
        </div>
      )}

      {touch && mode === 'foot' && !overlay && (
        <div className={styles.touchCombat}>
          <button
            type="button"
            className={styles.fireBtn}
            data-testid="touch-fire"
            aria-label="আক্রমণ"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              press('fire', true);
            }}
            onPointerUp={() => press('fire', false)}
            onPointerCancel={() => press('fire', false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            {ICON[weapon]}
          </button>
          {grenades > 0 && weapon !== 'grenade' && (
            <button
              type="button"
              className={styles.smallBtn}
              aria-label="গ্রেনেড ছোড়ো"
              onPointerDown={(e) => {
                e.stopPropagation();
                press('throw', true);
              }}
              onPointerUp={() => press('throw', false)}
              onPointerCancel={() => press('throw', false)}
            >
              💣
            </button>
          )}
        </div>
      )}
    </>
  );
}
