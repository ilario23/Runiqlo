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
            retry: 1,
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
