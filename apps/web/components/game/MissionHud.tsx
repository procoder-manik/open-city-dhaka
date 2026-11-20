'use client';

import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import type { Game } from '@game/engine';
import styles from './combat.module.css';

/** Current objective + timer, and the big "মিশন পাস!" / "মিশন ফেল" card. */
export function MissionHud({ game }: { game: Game }) {
  const mission = useStore(game.store, (s) => s.mission);
  const card = useStore(game.store, (s) => s.missionCard);
  const done = useStore(game.store, (s) => s.missionsDone);
  const total = useStore(game.store, (s) => s.missionsTotal);
  const [shown, setShown] = useState(card);

  useEffect(() => {
    if (!card) return;
    setShown(card);
    const t = setTimeout(() => setShown((c) => (c?.id === card.id ? null : c)), 3800);
    return () => clearTimeout(t);
  }, [card]);

  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;

  return (
    <>
      {mission ? (
        <div className={styles.mission} data-testid="mission">
          <b>{mission.title}</b>
          <span>{mission.objective}</span>
          {mission.time !== null && (
            <em data-low={mission.time <= 20 ? '1' : undefined}>⏱ {mmss(mission.time)}</em>
          )}
        </div>
      ) : (
        <div className={styles.missionIdle} data-testid="mission-progress">
          🎯 মিশন {done.toLocaleString('bn-BD')}/{total.toLocaleString('bn-BD')}
          {done < total && <small> — ম্যাপে হলুদ দাগে যাও</small>}
        </div>
      )}
      {shown && (
        <div
          className={styles.card}
          data-kind={shown.kind}
          key={shown.id}
          data-testid="mission-card"
        >
          <h3>{shown.title}</h3>
          <p>{shown.sub}</p>
        </div>
      )}
    </>
  );
}
