'use client';

import Image from 'next/image';
import {motion} from 'framer-motion';
import {Activity, BarChart3, Bot} from 'lucide-react';
import {useStravaAuth} from '@/contexts/StravaAuthContext';

interface ConnectPromptProps {
  /** Context line shown under the headline (varies per page). */
  subtitle?: string;
}

const FEATURES = [
  {icon: Activity, title: 'Form & fitness', desc: 'CTL · ATL · TSB, tracked daily'},
  {icon: BarChart3, title: 'Zone analysis', desc: 'HR zones & aerobic decoupling'},
  {icon: Bot, title: 'AI coach', desc: 'Plans built around your data'},
] as const;

const ease = [0.22, 1, 0.36, 1] as const;

export function ConnectPrompt({
  subtitle = 'Connect your Strava account to sync activities and unlock your training dashboard.',
}: ConnectPromptProps) {
  const {login} = useStravaAuth();

  return (
    <div className="relative min-h-dvh flex items-center justify-center overflow-hidden px-6 py-16">
      {/* ── Ambient background ─────────────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(252,76,2,0.10) 0%, transparent 70%),' +
            'radial-gradient(40% 40% at 85% 90%, rgba(10,132,255,0.06) 0%, transparent 70%)',
        }}
      />
      {/* Faint training-load curve motif */}
      <svg
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 right-0 w-full"
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
        style={{height: '38vh', opacity: 0.5}}
      >
        <defs>
          <linearGradient id="welcomeFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 160 C 150 150, 250 90, 400 110 S 650 60, 800 80 S 1050 30, 1200 70 L 1200 200 L 0 200 Z"
          fill="url(#welcomeFade)"
        />
        <path
          d="M0 160 C 150 150, 250 90, 400 110 S 650 60, 800 80 S 1050 30, 1200 70"
          fill="none"
          stroke="var(--color-accent)"
          strokeOpacity="0.25"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <motion.div
        initial={{opacity: 0, y: 16}}
        animate={{opacity: 1, y: 0}}
        transition={{duration: 0.6, ease}}
        className="relative w-full max-w-md text-center"
      >
        {/* Brand */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <Image src="/logo.png" alt="" width={32} height={32} className="w-8 h-8" />
          <span
            className="font-semibold text-sm text-white tracking-[0.18em]"
          >
            RUNIQLO
          </span>
        </div>

        {/* Headline */}
        <h1
          className="text-[2rem] sm:text-[2.5rem] font-bold leading-[1.05] tracking-tight text-white"
        >
          Train with intent.
        </h1>
        <p
          className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed"
          style={{color: 'var(--color-text-2)'}}
        >
          {subtitle}
        </p>

        {/* Primary CTA */}
        <motion.button
          type="button"
          onClick={login}
          whileTap={{scale: 0.98}}
          className="group mt-8 inline-flex w-full items-center justify-center gap-2.5 rounded-[10px] bg-brand py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand/90 cursor-pointer"
        >
          {/* Strava bolt mark */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          Connect with Strava
        </motion.button>
        <p className="mt-3 text-[11px]" style={{color: 'var(--color-text-2)'}}>
          Strava credentials are never stored in the browser.
        </p>

        {/* Feature strip — one cohesive panel, divided, not a card grid */}
        <motion.div
          initial={{opacity: 0, y: 12}}
          animate={{opacity: 1, y: 0}}
          transition={{duration: 0.5, ease, delay: 0.25}}
          className="surface-card mt-12 flex divide-x divide-[var(--color-border)] text-left"
        >
          {FEATURES.map(({icon: Icon, title, desc}) => (
            <div key={title} className="flex-1 px-3.5 py-4">
              <Icon size={16} className="mb-2.5" style={{color: 'var(--color-accent)'}} aria-hidden />
              <p className="text-[12px] font-semibold leading-tight text-white">{title}</p>
              <p className="mt-1 text-[11px] leading-snug" style={{color: 'var(--color-text-2)'}}>
                {desc}
              </p>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
