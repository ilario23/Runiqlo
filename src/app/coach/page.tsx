'use client';

import {Suspense, useState, useEffect} from 'react';
import {useSearchParams, useRouter} from 'next/navigation';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import AppHeader from '@/components/AppHeader';
import {ChatPanel} from './components/ChatPanel';

const ONBOARDING_MESSAGE = "Hi! I'd like to set up my training plan with you. Walk me through it.";

function CoachPageInner() {
  const {athlete} = useStravaAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Capture at mount — router.replace would clear searchParams on re-render
  const [prefillQ] = useState(() => searchParams.get('q') ?? undefined);

  // Clean ?q= from URL after reading
  useEffect(() => {
    if (prefillQ) {
      router.replace('/coach', {scroll: false});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Not connected ─────────────────────────────────────────────────────────────
  if (!athlete) {
    return (
      <div className="min-h-screen" style={{background: 'var(--color-base)'}}>
        <AppHeader />
        <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] mt-14">
          <p style={{color: 'var(--color-text-3)'}} className="text-sm">
            Connect Strava to use the coach
          </p>
        </div>
      </div>
    );
  }

  const athleteId = athlete.id;

  return (
    <div className="flex flex-col h-dvh" style={{background: 'var(--color-base)'}}>
      <AppHeader />
      <div className="flex-1 overflow-hidden pt-14">
        <ChatPanel
          athleteId={athleteId}
          initialMessage={prefillQ ? undefined : ONBOARDING_MESSAGE}
          prefillInput={prefillQ}
        />
      </div>
    </div>
  );
}

export default function CoachPage() {
  return (
    <Suspense fallback={null}>
      <CoachPageInner />
    </Suspense>
  );
}
