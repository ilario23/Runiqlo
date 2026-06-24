'use client';

import {
  QueryClient,
  QueryClientProvider,
  defaultShouldDehydrateQuery,
  type QueryKey,
} from '@tanstack/react-query';
import {PersistQueryClientProvider} from '@tanstack/react-query-persist-client';
import {createSyncStoragePersister} from '@tanstack/query-sync-storage-persister';
import {MotionConfig} from 'framer-motion';
import {useState, type ReactNode} from 'react';
import {StravaAuthProvider} from '@/contexts/StravaAuthContext';
import {SettingsProvider} from '@/contexts/SettingsContext';
import {ServiceWorkerRegistrar} from '@/components/ServiceWorkerRegistrar';

// Bump to invalidate every persisted cache after a breaking data-shape change.
const CACHE_BUSTER = 'v2';
const PERSIST_MAX_AGE = 1000 * 60 * 60 * 24; // 24h — must be <= queries' gcTime

// Only the small landing/dashboard summary queries are persisted. Heavy or
// volatile entries (raw HR streams, per-activity detail, weather, segments,
// paginated lists) are excluded so localStorage stays well under its ~5MB cap.
// NOTE: zone-breakdowns is intentionally NOT persisted — its query data is a
// Map, which JSON serialization corrupts into a plain object on rehydration.
const PERSISTED_KEY_PREFIXES: QueryKey[] = [
  ['strava', 'activities', 'dashboard'],
  ['strava', 'stats'],
  ['strava', 'zones'],
  ['strava', 'gear'],
  ['best-efforts'],
  ['dashboard', 'fitness'],
];

const startsWith = (key: QueryKey, prefix: QueryKey): boolean =>
  prefix.every((seg, i) => key[i] === seg);

const shouldPersistQuery = (key: QueryKey): boolean =>
  PERSISTED_KEY_PREFIXES.some((prefix) => startsWith(key, prefix));

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

  // Created client-side only; null during SSR so we never touch localStorage
  // on the server. On hydration this initializer runs in the browser.
  const [persister] = useState(() =>
    typeof window === 'undefined'
      ? null
      : createSyncStoragePersister({
          storage: window.localStorage,
          key: 'runiqlo-rq-cache',
        }),
  );

  const tree = (
    <MotionConfig reducedMotion="user">
      <ServiceWorkerRegistrar />
      <StravaAuthProvider>
        <SettingsProvider>{children}</SettingsProvider>
      </StravaAuthProvider>
    </MotionConfig>
  );

  if (!persister) {
    return <QueryClientProvider client={queryClient}>{tree}</QueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE,
        buster: CACHE_BUSTER,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) &&
            shouldPersistQuery(query.queryKey),
        },
      }}
    >
      {tree}
    </PersistQueryClientProvider>
  );
}
