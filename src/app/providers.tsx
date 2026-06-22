'use client';

import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MotionConfig} from 'framer-motion';
import {useState, type ReactNode} from 'react';
import {StravaAuthProvider} from '@/contexts/StravaAuthContext';
import {SettingsProvider} from '@/contexts/SettingsContext';
import {ServiceWorkerRegistrar} from '@/components/ServiceWorkerRegistrar';

export function Providers({children}: {children: ReactNode}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Don't retry client errors (401/403/404) — they won't fix
            // themselves. Retry transient/5xx/network up to 3x.
            retry: (failureCount, error) => {
              const status =
                (error as {status?: number})?.status ??
                Number((error as Error)?.message?.match(/\b(\d{3})\b/)?.[1]);
              if (status >= 400 && status < 500) return false;
              return failureCount < 3;
            },
            // Exponential backoff capped at 30s, jittered to avoid thundering herd.
            retryDelay: (attempt) =>
              Math.min(1000 * 2 ** attempt, 30_000) + Math.random() * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <ServiceWorkerRegistrar />
        <StravaAuthProvider>
          <SettingsProvider>
            {children}
          </SettingsProvider>
        </StravaAuthProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
