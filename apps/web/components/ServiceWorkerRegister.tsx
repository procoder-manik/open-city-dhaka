'use client';

import { useEffect } from 'react';

/** Registers the offline cache service worker (production only). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      console.warn('[sw] registration failed', err);
    });
  }, []);
  return null;
}
