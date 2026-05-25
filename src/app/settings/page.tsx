'use client';

import {useEffect, Suspense, useState} from 'react';
import {useSearchParams, useRouter} from 'next/navigation';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useSettings} from '@/contexts/SettingsContext';
import {useAthleteNotes} from '@/hooks/useStrava';
import type {InjuryEntry} from '@/hooks/useStrava';
import {ZONE_COLORS, ZONE_NAMES, defaultSettings, COLORS} from '@/lib/activityModel';
import type {UserSettings} from '@/lib/activityModel';
import {Skeleton} from '@/components/ui/skeleton';
import AppHeader from '@/components/AppHeader';

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
  powerful: 'text-accent-blue bg-accent-blue/10',
  balanced: 'text-accent-green bg-accent-green/10',
  fast:     'text-yellow-400 bg-yellow-400/10',
};

const SEVERITY_COLORS: Record<string, string> = {
  mild: COLORS.yellow,
  moderate: COLORS.orange,
  severe: COLORS.red,
};

const SEVERITY_OPTIONS = ['mild', 'moderate', 'severe'] as const;

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
    <div className="bento-card p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-white">Coach Model</p>
        {activeVendor && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-white/35 font-medium capitalize">
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
                   style={{color: isActiveVendor ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)'}}>
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
                            ? 'opacity-30 cursor-not-allowed border-white/[0.05] bg-transparent'
                            : isSelected
                              ? 'border-accent-blue/40 bg-accent-blue/[0.08] cursor-default'
                              : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.15] cursor-pointer'
                          }
                        `}
                      >
                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 transition-all ${
                          isSelected && !disabled
                            ? 'border-accent-blue bg-accent-blue'
                            : 'border-white/20 bg-transparent'
                        }`} />
                        <span className={`flex-1 text-[12px] font-medium ${disabled ? 'text-white/30' : isSelected ? 'text-white' : 'text-white/70'}`}>
                          {m.label}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${TIER_BADGE[m.tier] ?? 'text-white/30 bg-white/[0.05]'}`}>
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

// ─── Athlete Notes card ───────────────────────────────────────────────────────

function AthleteNotesCard() {
  const {notes, isLoading, saveNotes, isSaving} = useAthleteNotes();

  const [editing, setEditing] = useState(false);
  const [freeformDraft, setFreeformDraft] = useState('');
  const [injuriesDraft, setInjuriesDraft] = useState<InjuryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setFreeformDraft(notes?.freeformNotes ?? '');
    setInjuriesDraft(notes?.injuryHistory ? [...notes.injuryHistory] : []);
    setError(null);
    setEditing(true);
  };

  const cancel = () => { setEditing(false); setError(null); };

  const save = async () => {
    setError(null);
    try {
      await saveNotes({freeformNotes: freeformDraft || null, injuryHistory: injuriesDraft});
      setEditing(false);
    } catch {
      setError('Failed to save — please try again.');
    }
  };

  const addInjury = () =>
    setInjuriesDraft(d => [...d, {bodyPart: '', severity: 'mild', resolved: false}]);

  const removeInjury = (i: number) =>
    setInjuriesDraft(d => d.filter((_, idx) => idx !== i));

  const updateInjury = <K extends keyof InjuryEntry>(i: number, key: K, val: InjuryEntry[K]) =>
    setInjuriesDraft(d => d.map((entry, idx) => idx === i ? {...entry, [key]: val} : entry));

  return (
    <div className="bento-card p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-white">Athlete Notes</p>
        {editing ? (
          <div className="flex items-center gap-2">
            <button onClick={cancel} className="text-xs text-white/40 hover:text-white/60 transition-colors px-2 py-1">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={isSaving}
              className="text-xs bg-accent-blue text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-accent-blue/85 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 bg-white/[0.05] hover:bg-white/[0.09] px-3 py-1.5 rounded-lg transition-all flex-shrink-0"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit notes
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ) : editing ? (
        <div className="space-y-4">
          {/* Injury History */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-medium text-white/30 uppercase tracking-wide">Injury History</p>
              <button
                onClick={addInjury}
                className="text-[10px] text-accent-blue hover:text-accent-blue/80 transition-colors flex items-center gap-0.5"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add
              </button>
            </div>
            {injuriesDraft.length === 0 ? (
              <p className="text-[11px] text-white/20 py-1">No injuries logged</p>
            ) : (
              <div className="space-y-2">
                {injuriesDraft.map((inj, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Body part…"
                      value={inj.bodyPart}
                      onChange={e => updateInjury(i, 'bodyPart', e.target.value)}
                      className="flex-1 bg-white/[0.06] border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder:text-white/20 focus:outline-none focus:border-accent-blue/50 transition-colors"
                    />
                    <select
                      value={inj.severity}
                      onChange={e => updateInjury(i, 'severity', e.target.value as InjuryEntry['severity'])}
                      className="bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-accent-blue/50 transition-colors appearance-none"
                    >
                      {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-[11px] text-white/40 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={inj.resolved}
                        onChange={e => updateInjury(i, 'resolved', e.target.checked)}
                        className="accent-accent-green"
                      />
                      Resolved
                    </label>
                    <button onClick={() => removeInjury(i)} className="text-white/20 hover:text-accent-red transition-colors flex-shrink-0">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Freeform Notes */}
          <div>
            <p className="text-[10px] font-medium text-white/30 uppercase tracking-wide mb-2">Free-form Notes</p>
            <textarea
              value={freeformDraft}
              onChange={e => setFreeformDraft(e.target.value)}
              placeholder="Anything the coach should know — training preferences, lifestyle constraints, goals…"
              rows={5}
              className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-[12px] text-white placeholder:text-white/20 focus:outline-none focus:border-accent-blue/40 transition-colors resize-none leading-relaxed"
            />
          </div>

          {error && <p className="text-[11px] text-accent-red">{error}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {notes?.injuryHistory && notes.injuryHistory.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-white/30 uppercase tracking-wide mb-2">Injury History</p>
              <div className="flex flex-wrap gap-1.5">
                {notes.injuryHistory.map((inj, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border"
                    style={{
                      borderColor: `${SEVERITY_COLORS[inj.severity]}30`,
                      color: inj.resolved ? 'rgba(255,255,255,0.3)' : SEVERITY_COLORS[inj.severity],
                      background: `${SEVERITY_COLORS[inj.severity]}10`,
                    }}
                  >
                    <span className={inj.resolved ? 'line-through' : ''}>{inj.bodyPart}</span>
                    <span className="opacity-50 text-[10px]">{inj.severity}</span>
                    {inj.resolved && <span className="opacity-40 text-[10px]">✓</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {notes?.freeformNotes ? (
            <div>
              <p className="text-[10px] font-medium text-white/30 uppercase tracking-wide mb-2">Notes</p>
              <p className="text-[12px] text-white/55 leading-relaxed whitespace-pre-wrap">{notes.freeformNotes}</p>
            </div>
          ) : null}

          {(!notes || (!notes.freeformNotes && (!notes.injuryHistory || notes.injuryHistory.length === 0))) && (
            <p className="text-xs text-white/20 py-2">
              No notes yet — add context the AI coach should know about you.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({children}: {children: React.ReactNode}) {
  return (
    <h2 className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-3 px-1">
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
    <div className="bento-card p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">Heart Rate Zones</p>
          <p className="text-xs text-white/35 mt-0.5">Customize your training zone boundaries</p>
        </div>
        {editing ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={reset}
              className="text-xs text-white/25 hover:text-white/45 transition-colors px-2 py-1"
            >
              Reset
            </button>
            <button
              onClick={cancel}
              className="text-xs text-white/40 hover:text-white/60 transition-colors px-2 py-1"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="text-xs bg-accent-blue text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-accent-blue/85 transition-colors"
            >
              Save
            </button>
          </div>
        ) : (
          <button
            onClick={startEdit}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 bg-white/[0.05] hover:bg-white/[0.09] px-3 py-1.5 rounded-lg transition-all flex-shrink-0"
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
          <div key={field} className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5">
            <p className="text-[10px] text-white/35 uppercase tracking-wide mb-2">{label}</p>
            {editing ? (
              <div className="flex items-baseline gap-1.5">
                <input
                  type="number"
                  value={draft[field]}
                  onChange={e => setDraft(d => ({...d, [field]: Number(e.target.value)}))}
                  className="w-16 bg-transparent border-b border-white/20 focus:border-accent-blue text-xl font-bold text-white tabular-nums focus:outline-none transition-colors pb-0.5"
                  min={min} max={max}
                />
                <span className="text-xs text-white/30">bpm</span>
              </div>
            ) : (
              <p className="text-xl font-bold text-white tabular-nums">
                {settings[field]}<span className="text-xs font-normal text-white/30 ml-1">bpm</span>
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
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.03] transition-colors"
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background: color}} />
              <span className="text-xs font-medium text-white/55 w-[110px] flex-shrink-0">
                Z{z} · {ZONE_NAMES[z]}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
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
                    className="w-14 bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1 text-xs text-white tabular-nums text-right focus:outline-none focus:border-accent-blue/60 transition-colors"
                  />
                  <span className="text-[10px] text-white/25">–</span>
                  <input
                    type="number"
                    value={hi}
                    onChange={e => setZoneBound(zKey, 1, Number(e.target.value))}
                    className="w-14 bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1 text-xs text-white tabular-nums text-right focus:outline-none focus:border-accent-blue/60 transition-colors"
                  />
                  <span className="text-[10px] text-white/25 ml-0.5">bpm</span>
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
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-accent-blue animate-spin" />
      </div>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="min-h-screen pt-[72px] pb-10 px-5">
        <div className="max-w-[600px] mx-auto space-y-7">

          {/* Page title */}
          <div className="pt-2 pb-1">
            <h1 className="text-xl font-semibold tracking-tight text-white">Settings</h1>
          </div>

          {/* ── Account ────────────────────────────────────────────────────── */}
          <section>
            <SectionLabel>Account</SectionLabel>
            <div className="bento-card p-5">
              {isAuthenticated && athlete ? (
                <div className="space-y-4">
                  {/* Athlete row */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand/15 flex items-center justify-center text-brand font-bold text-sm flex-shrink-0">
                      {athlete.firstname[0]}{athlete.lastname[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">
                        {athlete.firstname} {athlete.lastname}
                      </p>
                      <p className="text-xs text-white/35 mt-0.5">@{athlete.username}</p>
                    </div>
                    <span className="text-[10px] bg-accent-green/10 text-accent-green px-2.5 py-0.5 rounded-full font-medium flex-shrink-0">
                      Connected
                    </span>
                  </div>

                  <div className="h-px bg-white/[0.06]" />

                  {/* Actions */}
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs text-white/30 leading-relaxed">
                      Activities, segments, and gear sync from your Strava account.
                    </p>
                    <button
                      onClick={logout}
                      className="text-xs font-medium text-white/35 hover:text-accent-red transition-colors flex-shrink-0"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-white">Strava</p>
                    <p className="text-xs text-white/35 mt-1 leading-relaxed">
                      Connect your account to sync activities, segments, and gear.
                    </p>
                  </div>
                  <button
                    onClick={login}
                    className="w-full flex items-center justify-center gap-2.5 bg-brand hover:bg-brand/90 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
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

          {/* ── Training ───────────────────────────────────────────────────── */}
          {isAuthenticated && (
            <section>
              <SectionLabel>Training</SectionLabel>
              <HrZonesEditor />
            </section>
          )}

          {/* ── Coach ──────────────────────────────────────────────────────── */}
          {isAuthenticated && (
            <section>
              <SectionLabel>Coach</SectionLabel>
              <div className="space-y-4">
                <CoachModelCard />
                <AthleteNotesCard />
              </div>
            </section>
          )}

          {/* ── Footer note ─────────────────────────────────────────────────── */}
          <p className="text-xs text-white/20 text-center leading-relaxed px-6">
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
          <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-accent-blue animate-spin" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
