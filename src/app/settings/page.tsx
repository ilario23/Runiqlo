'use client';

import {useEffect, Suspense} from 'react';
import {useSearchParams, useRouter} from 'next/navigation';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import AppHeader from '@/components/AppHeader';

function SettingsContent() {
  const {isAuthenticated, isLoading, athlete, login, logout, handleOAuthCallback} = useStravaAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const code = searchParams.get('code');
    if (code && !isAuthenticated) {
      handleOAuthCallback(code)
        .then(() => router.replace('/settings'))
        .catch(console.error);
    }
  }, [searchParams, isAuthenticated, handleOAuthCallback, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-[#0a84ff] animate-spin" />
      </div>
    );
  }

  return (
    <>
      <AppHeader />
    <div className="min-h-screen pt-14 flex items-center justify-center p-6">
      <div className="bento-card p-8 w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏃</span>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Strava Coach</h1>
          </div>
          <p className="text-sm text-white/50">Connect your Strava account to get started</p>
        </div>

        <div className="h-px bg-white/10" />

        {isAuthenticated && athlete ? (
          <div className="space-y-5">
            {/* Athlete card */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
              <div className="w-10 h-10 rounded-full bg-[#0a84ff]/20 flex items-center justify-center text-[#0a84ff] font-semibold text-sm">
                {athlete.firstname[0]}{athlete.lastname[0]}
              </div>
              <div>
                <p className="text-sm font-medium text-white">{athlete.firstname} {athlete.lastname}</p>
                <p className="text-xs text-white/40">@{athlete.username}</p>
              </div>
              <div className="ml-auto">
                <span className="text-xs bg-[#30d158]/15 text-[#30d158] px-2 py-0.5 rounded-full font-medium">Connected</span>
              </div>
            </div>

            <div className="flex gap-2">
              <a
                href="/"
                className="flex-1 bg-[#0a84ff] hover:bg-[#0a84ff]/90 text-white text-sm font-medium py-2.5 rounded-xl text-center transition-colors"
              >
                Go to Dashboard
              </a>
              <button
                onClick={logout}
                className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-3 bg-[#fc4c02] hover:bg-[#fc4c02]/90 text-white font-semibold py-3.5 rounded-xl transition-colors text-sm"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
            Connect with Strava
          </button>
        )}

        <p className="text-xs text-white/30 text-center leading-relaxed">
          Your data is synced to your private Supabase database.
          Strava credentials are never stored in the browser.
        </p>
      </div>
    </div>
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-[#0a84ff] animate-spin" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
