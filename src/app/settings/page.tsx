'use client';

import {useEffect, Suspense, useState} from 'react';
import pkg from '../../../package.json';
import Link from 'next/link';
import Image from 'next/image';
import {useSearchParams, useRouter} from 'next/navigation';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useSettings} from '@/contexts/SettingsContext';
import {useBackfillZoneData} from '@/hooks/useStrava';
import {ZONE_COLORS, ZONE_NAMES, defaultSettings, ACCENTS} from '@/lib/activityModel';
import type {UserSettings, ThemeMode, AccentKey} from '@/lib/activityModel';
import {Skeleton} from '@/components/ui/skeleton';
import AppHeader from '@/components/AppHeader';
import CoachKnowledgeCard from './components/CoachKnowledgeCard';

// ─── Coach types & constants ──────────────────────────────────────────────────

interface ModelDef {
  id: string;
  label: string;
  tier: string;
}

interface ProviderConfig {
  provider: 'anthropic' | 'openai';
  anthropicModels: ModelDef[];
  openaiModels: ModelDef[];
}

const TIER_BADGE: Record<string, string> = {
  powerful: 'text-[var(--color-accent)] bg-[var(--color-accent-dim)]',
  balanced: 'text-accent-green bg-accent-green/10',
  fast:     'text-accent-yellow bg-accent-yellow/10',
};

// ─── Coach Model card ─────────────────────────────────────────────────────────

function CoachModelCard() {
  const {settings, updateSettings} = useSettings();
  const [config, setConfig] = useState<ProviderConfig | null>(null);

  useEffect(() => {
    fetch('/api/coach/provider')
      .then(r => r.json())
      .then((d: ProviderConfig) => setConfig(d))
      .catch(() => {/* keep null */});
  }, []);

  const activeVendor = config?.provider ?? null;

  const handleSelect = (vendorId: string) => {
    updateSettings({coachModel: vendorId});
  };

  const defaultForVendor = activeVendor === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-4o-mini';
  const selected = settings.coachModel ?? defaultForVendor;

  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-[var(--text)]">Coach Model</p>
        {activeVendor && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-surface-1)] text-[var(--faint)] font-medium capitalize">
            {activeVendor}
          </span>
        )}
      </div>

      {!config ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {(['anthropic', 'openai'] as const).map(vendor => {
            const models = vendor === 'anthropic' ? config.anthropicModels : config.openaiModels;
            const isActiveVendor = vendor === activeVendor;
            return (
              <div key={vendor}>
                <p className="text-[10px] font-medium uppercase tracking-wide mb-1.5 px-1"
                   style={{color: isActiveVendor ? 'rgba(26,24,20,0.4)' : 'rgba(26,24,20,0.15)'}}>
                  {vendor === 'anthropic' ? 'Anthropic' : 'OpenAI'}
                  {!isActiveVendor && <span className="ml-1.5 normal-case">(not configured)</span>}
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {models.map(m => {
                    const isSelected = selected === m.id;
                    const disabled = !isActiveVendor;
                    return (
                      <button
                        key={m.id}
                        disabled={disabled}
                        onClick={() => handleSelect(m.id)}
                        className={`
                          w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all
                          ${disabled
                            ? 'opacity-30 cursor-not-allowed border-[var(--color-border)] bg-transparent'
                            : isSelected
                              ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent-dim)] cursor-default'
                              : 'border-[var(--color-border)] bg-[var(--color-surface-0)] hover:bg-[var(--color-surface-1)] hover:border-[var(--line)] cursor-pointer'
                          }
                        `}
                      >
                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 transition-all ${
                          isSelected && !disabled
                            ? 'border-[var(--color-accent)] bg-[var(--color-accent)]'
                            : 'border-[var(--line)] bg-transparent'
                        }`} />
                        <span className={`flex-1 text-[12px] font-medium ${disabled ? 'text-[var(--faint)]' : isSelected ? 'text-[var(--text)]' : 'text-[var(--text)]'}`}>
                          {m.label}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${TIER_BADGE[m.tier] ?? 'text-[var(--faint)] bg-[var(--panel)]'}`}>
                          {m.tier}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Appearance card (theme + accent, device-local) ──────────────────────────

const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[];

function AppearanceCard() {
  const {settings, updateSettings} = useSettings();
  const theme = settings.theme ?? 'dark';
  const accent = settings.accent ?? 'lime';

  return (
    <div className="surface-card p-5 space-y-5">
      <div>
        <p className="text-sm font-medium text-[var(--text)]">Appearance</p>
        <p className="text-xs text-[var(--faint)] mt-0.5">Saved on this device.</p>
      </div>

      {/* Theme */}
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-medium text-[var(--dim)]">Theme</span>
        <div className="flex p-0.5 rounded-[11px] bg-[var(--color-surface-1)] border border-[var(--color-border)]">
          {(['dark', 'light'] as ThemeMode[]).map((t) => (
            <button
              key={t}
              onClick={() => updateSettings({theme: t})}
              className="px-3.5 py-1.5 rounded-[9px] text-xs font-semibold capitalize transition-colors cursor-pointer"
              style={
                theme === t
                  ? {background: 'var(--accent)', color: 'var(--accent-ink)'}
                  : {background: 'transparent', color: 'var(--faint)'}
              }
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Accent */}
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-medium text-[var(--dim)]">Accent</span>
        <div className="flex items-center gap-2.5">
          {ACCENT_KEYS.map((key) => {
            const sel = accent === key;
            return (
              <button
                key={key}
                onClick={() => updateSettings({accent: key})}
                aria-label={key}
                aria-pressed={sel}
                className="w-7 h-7 rounded-full cursor-pointer transition-transform hover:scale-110"
                style={{
                  background: ACCENTS[key].accent,
                  boxShadow: sel ? `0 0 0 2px var(--panel), 0 0 0 4px ${ACCENTS[key].accent}` : 'none',
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({children}: {children: React.ReactNode}) {
  return (
    <h2 className="text-[10px] font-bold text-[var(--faint)] uppercase tracking-[0.12em] mb-3.5">
      {children}
    </h2>
  );
}

// ─── HR Zones editor ──────────────────────────────────────────────────────────

function HrZonesEditor() {
  const {settings, updateSettings} = useSettings();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<UserSettings>(settings);

  const startEdit = () => { setDraft(settings); setEditing(true); };
  const cancel = () => setEditing(false);
  const save = () => { updateSettings(draft); setEditing(false); };
  const reset = () => setDraft(defaultSettings);

  const setZoneBound = (zKey: keyof UserSettings['zones'], idx: 0 | 1, val: number) => {
    setDraft(d => ({
      ...d,
      zones: {
        ...d.zones,
        [zKey]: idx === 0 ? [val, d.zones[zKey][1]] : [d.zones[zKey][0], val],
      },
    }));
  };

  const viewData = editing ? draft : settings;

  return (
    <div className="surface-card p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--text)]">Heart Rate Zones</p>
          <p className="text-xs text-[var(--faint)] mt-0.5">Customize your training zone boundaries</p>
        </div>
        {editing ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={reset}
              className="text-xs text-[var(--faint)] hover:text-[var(--faint)] transition-colors px-2 py-1"
            >
              Reset
            </button>
            <button
              onClick={cancel}
              className="text-xs text-[var(--faint)] hover:text-[var(--dim)] transition-colors px-2 py-1"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="text-xs text-[var(--text)] font-semibold px-3 py-1.5 rounded-lg hover:opacity-85 transition-opacity"
              style={{background: 'var(--color-accent)'}}
            >
              Save
            </button>
          </div>
        ) : (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 text-xs text-[var(--faint)] hover:text-[var(--text)] bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] px-3 py-1.5 rounded-lg transition-all flex-shrink-0"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit zones
          </button>
        )}
      </div>

      {/* Max HR + Resting HR */}
      <div className="grid grid-cols-2 gap-3">
        {([
          {label: 'Max HR', field: 'maxHr' as const, min: 100, max: 220},
          {label: 'Resting HR', field: 'restingHr' as const, min: 30, max: 100},
        ] as const).map(({label, field, min, max}) => (
          <div key={field} className="surface-raised rounded-xl p-3.5">
            <p className="text-[10px] text-[var(--faint)] uppercase tracking-wide mb-2">{label}</p>
            {editing ? (
              <div className="flex items-baseline gap-1.5">
                <input
                  type="number"
                  value={draft[field]}
                  onChange={e => setDraft(d => ({...d, [field]: Number(e.target.value)}))}
                  className="w-16 bg-transparent border-b border-[var(--line)] focus:border-[var(--color-accent)] text-xl font-bold text-[var(--text)] tabular-nums focus:outline-none transition-colors pb-0.5"
                  min={min} max={max}
                />
                <span className="text-xs text-[var(--faint)]">bpm</span>
              </div>
            ) : (
              <p className="text-xl font-bold text-[var(--text)] tabular-nums">
                {settings[field]}<span className="text-xs font-normal text-[var(--faint)] ml-1">bpm</span>
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Zone rows */}
      <div className="space-y-1">
        {([1, 2, 3, 4, 5, 6] as const).map((z) => {
          const zKey = `z${z}` as keyof UserSettings['zones'];
          const [lo, hi] = viewData.zones[zKey];
          const color = ZONE_COLORS[z];
          const maxHr = viewData.maxHr;
          return (
            <div
              key={z}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--color-surface-1)] transition-colors"
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background: color}} />
              <span className="text-xs font-medium text-[var(--dim)] w-[110px] flex-shrink-0">
                Z{z} · {ZONE_NAMES[z]}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-[var(--color-surface-1)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    background: color,
                    width: `${Math.min(100, ((hi - 60) / (maxHr - 60)) * 100)}%`,
                    opacity: 0.6,
                  }}
                />
              </div>
              {editing ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <input
                    type="number"
                    value={lo}
                    onChange={e => setZoneBound(zKey, 0, Number(e.target.value))}
                    className="w-14 bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-xs text-[var(--text)] tabular-nums text-right focus:outline-none focus:border-[var(--color-accent)]/50 transition-colors"
                  />
                  <span className="text-[10px] text-[var(--faint)]">–</span>
                  <input
                    type="number"
                    value={hi}
                    onChange={e => setZoneBound(zKey, 1, Number(e.target.value))}
                    className="w-14 bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-xs text-[var(--text)] tabular-nums text-right focus:outline-none focus:border-[var(--color-accent)]/50 transition-colors"
                  />
                  <span className="text-[10px] text-[var(--faint)] ml-0.5">bpm</span>
                </div>
              ) : (
                <span className="text-xs font-semibold tabular-nums flex-shrink-0 w-[88px] text-right" style={{color}}>
                  {lo}–{hi} bpm
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Zone data backfill ───────────────────────────────────────────────────────

function BackfillZoneCard() {
  const {run, status, progress, hrActivityCount} = useBackfillZoneData();
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const running = status === 'running';

  return (
    <div className="surface-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--text)]">Training Load accuracy</p>
          <p className="text-xs text-[var(--faint)] mt-0.5 leading-relaxed">
            Recompute Training Load from full heart-rate streams (true time-in-zone)
            instead of average HR. Processes {hrActivityCount} activities — may fetch
            from Strava and take a few minutes.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running || hrActivityCount === 0}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all flex-shrink-0 ${
            running || hrActivityCount === 0
              ? 'opacity-40 cursor-not-allowed bg-[var(--color-surface-1)] text-[var(--faint)]'
              : 'text-[var(--text)] hover:opacity-85'
          }`}
          style={running || hrActivityCount === 0 ? undefined : {background: 'var(--color-accent)'}}
        >
          {running ? 'Processing…' : status === 'done' ? 'Run again' : 'Backfill'}
        </button>
      </div>

      {running && (
        <div className="space-y-1.5">
          <div className="h-1.5 rounded-full bg-[var(--color-surface-1)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{width: `${pct}%`, background: 'var(--color-accent)'}}
            />
          </div>
          <p className="text-[10px] text-[var(--faint)] tabular-nums">
            {progress.done} / {progress.total} ({pct}%)
          </p>
        </div>
      )}

      {status === 'done' && (
        <p className="text-[11px] text-accent-green font-medium">
          Done — Training Load updated from heart-rate streams.
        </p>
      )}
      {status === 'error' && (
        <p className="text-[11px] text-accent-red font-medium">
          Some activities failed (likely Strava rate limit). Wait a few minutes and run again.
        </p>
      )}
    </div>
  );
}

// ─── Main settings content ────────────────────────────────────────────────────

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
        <div className="w-8 h-8 rounded-full border-2 border-[var(--line)] border-t-white/60 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="min-h-screen pt-[72px] pb-24 md:pb-10 px-5">
        <div className="max-w-[600px] mx-auto space-y-8">

          {/* Page title */}
          <div className="pt-8 pb-1">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Settings</h1>
          </div>

          {/* ── Account ────────────────────────────────────────────────────── */}
          <section>
            <SectionLabel>Account</SectionLabel>
            <div className="surface-card p-5">
              {isAuthenticated && athlete ? (
                <div className="space-y-4">
                  {/* Athlete row */}
                  <div className="flex items-center gap-3">
                    {athlete.profile_medium ? (
                      <Image
                        src={athlete.profile_medium}
                        alt={`${athlete.firstname} ${athlete.lastname}`}
                        width={40}
                        height={40}
                        className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
                        unoptimized
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-[var(--color-accent-dim)] flex items-center justify-center text-[var(--color-accent)] font-bold text-sm flex-shrink-0">
                        {athlete.firstname[0]}{athlete.lastname[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text)]">
                        {athlete.firstname} {athlete.lastname}
                      </p>
                      <p className="text-xs text-[var(--faint)] mt-0.5">@{athlete.username}</p>
                    </div>
                    <span className="text-[10px] bg-accent-green/10 text-accent-green px-2.5 py-0.5 rounded-full font-medium flex-shrink-0">
                      Connected
                    </span>
                  </div>

                  <div className="h-px bg-[var(--color-border)]" />

                  {/* Actions */}
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs text-[var(--faint)] leading-relaxed">
                      Activities, segments, and gear sync from your Strava account.
                    </p>
                    <button
                      onClick={logout}
                      className="text-xs font-medium text-[var(--faint)] hover:text-accent-red transition-colors flex-shrink-0"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">Strava</p>
                    <p className="text-xs text-[var(--faint)] mt-1 leading-relaxed">
                      Connect your account to sync activities, segments, and gear.
                    </p>
                  </div>
                  <button
                    onClick={login}
                    className="w-full flex items-center justify-center gap-2.5 bg-brand hover:bg-brand/90 text-[var(--text)] font-semibold py-3 rounded-xl transition-colors text-sm"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.599h4.172L10.463 0l-7 13.828h4.169" />
                    </svg>
                    Connect with Strava
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* ── Appearance ──────────────────────────────────────────────────── */}
          <section>
            <SectionLabel>Appearance</SectionLabel>
            <AppearanceCard />
          </section>

          {/* ── App info ────────────────────────────────────────────────────── */}
          <section>
            <SectionLabel>App</SectionLabel>
            <div className="surface-card p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[var(--text)]">Version</p>
                <span className="text-xs font-mono text-[var(--faint)]">v{pkg.version}</span>
              </div>
            </div>
          </section>

          {/* ── Training ───────────────────────────────────────────────────── */}
          {isAuthenticated && (
            <section className="space-y-4">
              <SectionLabel>Training</SectionLabel>
              <HrZonesEditor />
              <BackfillZoneCard />
            </section>
          )}

          {/* ── Coach ──────────────────────────────────────────────────────── */}
          {isAuthenticated && (
            <section className="space-y-4">
              <SectionLabel>Coach</SectionLabel>
              <CoachModelCard />
              <CoachKnowledgeCard />
            </section>
          )}

          {/* ── Footer note ─────────────────────────────────────────────────── */}
          <p className="text-xs text-[var(--faint)] text-center leading-relaxed px-6">
            Your data lives in your private Supabase database.
            Strava credentials are never stored in the browser.
          </p>

        </div>
      </main>
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--line)] border-t-white/60 animate-spin" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
