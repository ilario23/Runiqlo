'use client';

import {useEffect} from 'react';

/**
 * Segment-level error boundary. Catches render/data errors below the root
 * layout and offers a reset without a full reload.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & {digest?: string};
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Route error:', error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <h1 className="text-lg font-medium tracking-tight">Something broke</h1>
      <p className="max-w-sm text-sm" style={{color: 'var(--text-soft, #5a564d)'}}>
        This view hit an error. Your data is safe — try again, and if it keeps
        failing, reload the page.
      </p>
      <button
        onClick={reset}
        className="rounded-full px-5 py-2 text-sm"
        style={{background: 'var(--text)', color: 'var(--bg)'}}
      >
        Try again
      </button>
    </div>
  );
}
