'use client';

import {useEffect} from 'react';

/**
 * Last-resort boundary for errors thrown in the root layout itself. Must
 * render its own <html>/<body> because it replaces the whole tree.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & {digest?: string};
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#f2ede2',
          color: '#1a1a1a',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          textAlign: 'center',
          padding: '2rem',
        }}
      >
        <div style={{maxWidth: '22rem'}}>
          <h1 style={{fontSize: '1.25rem', margin: '0 0 0.5rem'}}>
            Runiqlo crashed
          </h1>
          <p style={{color: '#5a564d', lineHeight: 1.5, margin: '0 0 1.5rem'}}>
            An unexpected error took down the app. Reloading usually fixes it.
          </p>
          <button
            onClick={reset}
            style={{
              font: 'inherit',
              border: '1px solid #1a1a1a',
              background: '#1a1a1a',
              color: '#f2ede2',
              padding: '0.6rem 1.4rem',
              borderRadius: 999,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
