'use client';

import {useEffect} from 'react';

/**
 * Registers the app-shell service worker in production only. Dev is skipped
 * to avoid stale-cache surprises during HMR. Returns nothing — side-effect
 * mount near the app root.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('SW registration failed:', err);
      });
    };
    // Defer past first paint so registration never competes with hydration.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, {once: true});
  }, []);

  return null;
}
