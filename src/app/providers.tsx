'use client';

import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useState, type ReactNode} from 'react';
import {StravaAuthProvider} from '@/contexts/StravaAuthContext';
import {SettingsProvider} from '@/contexts/SettingsContext';

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
      <StravaAuthProvider>
        <SettingsProvider>
          {children}
        </SettingsProvider>
      </StravaAuthProvider>
    </QueryClientProvider>
  );
}
