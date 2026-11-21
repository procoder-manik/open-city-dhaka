'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  HUD_GROUP_LABEL,
  HUD_GROUPS,
  MAX_SCALE,
  MIN_SCALE,
  resetLayout,
  setPlacement,
  useHudLayout,
  type HudGroup,
} from './hudLayout';
import styles from './hudEditor.module.css';

type Box = { g: HudGroup; left: number; top: number; width: number; height: number };

/**
 * Drag the touch-button groups anywhere and resize them (saved on this device).
 * The real buttons render underneath; this layer only draws handles over them.
 */
export function HudEditor({
  preview,
  onPreview,
  onDone,
}: {
  preview: 'foot' | 'vehicle';
  onPreview: (m: 'foot' | 'vehicle') => void;
  onDone: () => void;
}) {
  const layout = useHudLayout();
  const [boxes, setBoxes] = useState<Box[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    g: HudGroup;
    sx: number;
    sy: number;
    x: number;
    y: number;
  } | null>(null);

  // Measure the real groups after every layout/preview change
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      const host = rootRef.current?.getBoundingClientRect();
      const out: Box[] = [];
      for (const g of HUD_GROUPS) {
        const el = document.querySelector<HTMLElement>(`[data-hud="${g}"]`);
        if (!el || !host) continue;
        const r = el.getBoundingClientRect();
        out.push({
          g,
          left: r.left - host.left - 6,
          top: r.top - host.top - 6,
          width: r.width + 12,
          height: r.height + 12,
        });
      }
      setBoxes(out);
    };
    raf = requestAnimationFrame(() => (raf = requestAnimationFrame(measure)));
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [layout, preview]);

  const onDown = (g: HudGroup) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: e.pointerId,
      g,
      sx: e.clientX,
      sy: e.clientY,
      x: layout[g].x,
      y: layout[g].y,
    };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    setPlacement(d.g, {
      x: Math.round(Math.max(-w, Math.min(w, d.x + e.clientX - d.sx))),
      y: Math.round(Math.max(-h, Math.min(h, d.y + e.clientY - d.sy))),
    });
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };
  const scale = (g: HudGroup, by: number) =>
    setPlacement(g, { s: Math.round((layout[g].s + by) * 10) / 10 });

  return (
    <div ref={rootRef} className={styles.layer} data-testid="hud-editor">
      <div className={styles.bar}>
        <span className={styles.hint}>বাটন টেনে সরাও · − / + দিয়ে ছোট-বড়</span>
        <button
          type="button"
          className={styles.chip}
          onClick={() => onPreview(preview === 'foot' ? 'vehicle' : 'foot')}
          data-testid="hud-preview"
        >
          {preview === 'foot' ? '🚗 গাড়ির বাটন' : '🚶 হাঁটার বাটন'}
        </button>
        <button type="button" className={styles.chip} onClick={resetLayout} data-testid="hud-reset">
          রিসেট
        </button>
        <button type="button" className={styles.done} onClick={onDone} data-testid="hud-done">
          ঠিক আছে ✓
        </button>
      </div>
      {boxes.map((b) => (
        <div
          key={b.g}
          className={styles.box}
          style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
          onPointerDown={onDown(b.g)}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          data-testid={`hud-box-${b.g}`}
        >
          <span className={styles.label}>{HUD_GROUP_LABEL[b.g]}</span>
          <span className={styles.sizer} onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              aria-label="ছোট করো"
              disabled={layout[b.g].s <= MIN_SCALE}
              onClick={() => scale(b.g, -0.1)}
            >
              −
            </button>
            <button
              type="button"
              aria-label="বড় করো"
              disabled={layout[b.g].s >= MAX_SCALE}
              onClick={() => scale(b.g, 0.1)}
            >
              +
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
