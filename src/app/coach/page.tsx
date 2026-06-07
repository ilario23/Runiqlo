'use client';

import {Suspense, useState, useEffect} from 'react';
import {useSearchParams, useRouter} from 'next/navigation';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import AppHeader from '@/components/AppHeader';
import {ChatPanel} from './components/ChatPanel';
import {ConnectPrompt} from '@/components/ConnectPrompt';

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
        <div className="pt-14">
          <ConnectPrompt subtitle="Connect Strava to start chatting with your coach" />
        </div>
      </div>
    );
  }

  const athleteId = athlete.id;

  return (
    <div className="flex flex-col h-dvh" style={{background: 'var(--color-base)'}}>
      <AppHeader />
      <div className="flex-1 overflow-hidden pt-14 pb-[calc(51px+env(safe-area-inset-bottom))] md:pb-0">
        <ChatPanel
          athleteId={athleteId}
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
