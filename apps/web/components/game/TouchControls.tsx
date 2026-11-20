'use client';

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { Action, InputManager } from '@game/engine';
import styles from './play.module.css';

const JOYSTICK_RADIUS = 56;
/** Pushing the stick past this auto-sprints (like popular mobile shooters). */
const AUTO_SPRINT = 0.95;

interface Props {
  input: InputManager;
}

/**
 * Mobile/tablet controls: floating joystick (left half), drag-to-look (right half),
 * action buttons. Multi-touch: move + look + press buttons at the same time.
 */
export function TouchControls({ input }: Props) {
  const stickPointer = useRef<number | null>(null);
  const stickOrigin = useRef({ x: 0, y: 0 });
  const lookPointer = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);

  const showStick = (x: number, y: number, kx: number, ky: number, visible: boolean) => {
    const base = baseRef.current;
    const knob = knobRef.current;
    if (!base || !knob) return;
    base.style.opacity = visible ? '1' : '0.35';
    base.style.transform = `translate(${x - JOYSTICK_RADIUS}px, ${y - JOYSTICK_RADIUS}px)`;
    knob.style.transform = `translate(${kx}px, ${ky}px)`;
  };

  const resetStick = () => {
    stickPointer.current = null;
    input.setTouchMove(0, 0);
    input.setTouchButton('sprint', false);
    const base = baseRef.current?.parentElement;
    const rect = base?.getBoundingClientRect();
    showStick(rect ? rect.width * 0.28 : 120, rect ? rect.height * 0.68 : 200, 0, 0, false);
  };

  useEffect(() => {
    resetStick();
    return () => input.setTouchMove(0, 0);
    // Mount-only: place the stick at rest once; handlers read refs, not state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onStickDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stickPointer.current !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    stickPointer.current = e.pointerId;
    const rect = e.currentTarget.getBoundingClientRect();
    stickOrigin.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    showStick(stickOrigin.current.x, stickOrigin.current.y, 0, 0, true);
  };

  const onStickMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== stickPointer.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    let dx = e.clientX - rect.left - stickOrigin.current.x;
    let dy = e.clientY - rect.top - stickOrigin.current.y;
    const dist = Math.hypot(dx, dy);
    if (dist > JOYSTICK_RADIUS) {
      dx = (dx / dist) * JOYSTICK_RADIUS;
      dy = (dy / dist) * JOYSTICK_RADIUS;
    }
    const nx = dx / JOYSTICK_RADIUS;
    const ny = -dy / JOYSTICK_RADIUS;
    input.setTouchMove(nx, ny);
    input.setTouchButton('sprint', Math.hypot(nx, ny) >= AUTO_SPRINT);
    showStick(stickOrigin.current.x, stickOrigin.current.y, dx, dy, true);
  };

  const onStickUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId === stickPointer.current) resetStick();
  };

  const onLookDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (lookPointer.current !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    lookPointer.current = e.pointerId;
    lookLast.current = { x: e.clientX, y: e.clientY };
  };

  const onLookMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== lookPointer.current) return;
    input.addTouchLook(e.clientX - lookLast.current.x, e.clientY - lookLast.current.y);
    lookLast.current = { x: e.clientX, y: e.clientY };
  };

  const onLookUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerId === lookPointer.current) lookPointer.current = null;
  };

  const button = (action: Action, label: string, className: string) => (
    <button
      type="button"
      aria-label={label}
      className={`${styles.touchBtn} ${className}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        input.setTouchButton(action, true);
      }}
      onPointerUp={() => input.setTouchButton(action, false)}
      onPointerCancel={() => input.setTouchButton(action, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );

  return (
    <div className={styles.touchLayer}>
      <div
        className={styles.stickZone}
        onPointerDown={onStickDown}
        onPointerMove={onStickMove}
        onPointerUp={onStickUp}
        onPointerCancel={onStickUp}
      >
        <div ref={baseRef} className={styles.stickBase}>
          <div ref={knobRef} className={styles.stickKnob} />
        </div>
      </div>
      <div
        className={styles.lookZone}
        onPointerDown={onLookDown}
        onPointerMove={onLookMove}
        onPointerUp={onLookUp}
        onPointerCancel={onLookUp}
      />
      <div className={styles.btnCluster}>
        {button('interact', 'F', styles.btnSmall ?? '')}
        {button('sprint', '»', styles.btnSmall ?? '')}
        {button('jump', '⤒', styles.btnBig ?? '')}
      </div>
    </div>
  );
}
