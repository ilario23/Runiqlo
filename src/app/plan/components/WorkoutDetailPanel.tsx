'use client';

import {useState, useRef} from 'react';
import {Activity, TrendingUp, Zap, Timer, Wind, Dumbbell, Bike, Leaf, Shuffle, Moon, Mountain, Waves, Footprints} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import type {WorkoutType} from '@/lib/coachTypes';
import {COLORS} from '@/lib/activityModel';
import {useSettings} from '@/contexts/SettingsContext';
import {parseStructuredSteps} from '@/lib/workoutUtils';
import {StructuredWorkoutDisplay} from '@/components/StructuredWorkoutDisplay';
import {convertSession, CONVERTIBLE_RUN_TYPES, type ConvertibleSport} from '@/lib/trimpConversion';
import type {SelectedWorkout} from './WeekPlan';

const DAY_NAMES_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const TYPE_LABELS: Record<string, string> = {
  easy_run: 'Easy Run', long_run: 'Long Run', tempo_run: 'Tempo Run',
  interval_run: 'Intervals', recovery_run: 'Recovery Run', gym: 'Gym',
  cycling: 'Cycling', yoga: 'Yoga', cross_training: 'Cross Training', rest: 'Rest',
  swim: 'Swim', walk: 'Walk', hike: 'Hike',
};

interface MatchCandidate {
  id: number;
  name: string;
  type: string;
  date: string;
  distanceKm: number;
  durationMin: number;
  avgPace: string;
  startTime: string | null;
  matchScore: number;
  isBestMatch: boolean;
  alreadyLinked: boolean;
}

const ACTIVITY_TYPE_ICON: Record<string, LucideIcon> = {
  Run: Activity,
  Ride: Bike,
  Hike: Mountain,
  Swim: Waves,
};

function parsePhases(text: string | null | undefined): {label: string; text: string}[] {
  if (!text) return [];

  // Try splitting on newlines first
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  if (lines.length > 1) {
    return lines.map(line => {
      const colonIdx = line.indexOf(':');
      const candidate = colonIdx > 0 ? line.slice(0, colonIdx).trim() : '';
      const isLabel = candidate.length > 0 && candidate.length <= 20 && candidate === candidate.toUpperCase();
      return isLabel
        ? {label: candidate, text: line.slice(colonIdx + 1).trim()}
        : {label: '', text: line};
    });
  }

  // Single line: try splitting on ", then " or " then "
  const parts = text.split(/,?\s+then\s+/i).map(p => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    return parts.map(p => ({label: '', text: p}));
  }

  return [{label: '', text: text}];
}

function getZoneColor(intensityDescription: string | null | undefined): string {
  if (!intensityDescription) return 'bg-[var(--color-paper-2)] text-[var(--color-ink-2)]';
  const match = intensityDescription.match(/zone\s*([1-6])/i);
  if (!match) return 'bg-[var(--color-paper-2)] text-[var(--color-ink-2)]';
  const zone = parseInt(match[1]);
  if (zone <= 2) return 'bg-accent-green/15 text-accent-green';
  if (zone === 3) return 'bg-accent-yellow/15 text-accent-yellow';
  if (zone <= 5) return 'bg-accent-red/15 text-accent-red';
  return 'bg-accent-purple/15 text-accent-purple';
}

const CONVERT_SPORT_CONFIG: Record<ConvertibleSport, {label: string; icon: LucideIcon; color: string}> = {
  cycling: {label: 'Bike',  icon: Bike,       color: 'border-accent-blue/40 bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20'},
  swim:     {label: 'Swim',  icon: Waves,      color: 'border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan hover:bg-accent-cyan/20'},
  walk:     {label: 'Walk',  icon: Footprints, color: 'border-accent-green/40 bg-accent-green/10 text-accent-green hover:bg-accent-green/20'},
  hike:     {label: 'Hike',  icon: Mountain,   color: 'border-accent-green/40 bg-accent-green/10 text-accent-green hover:bg-accent-green/20'},
};

const SPORT_TO_WORKOUT_TYPE: Record<ConvertibleSport, WorkoutType> = {
  cycling: 'cycling',
  swim: 'swim',
  walk: 'walk',
  hike: 'hike',
};

export function WorkoutDetailPanel({
  selected,
  athleteId,
  weekStart,
  onClose,
  canLink,
  onMarkDone,
  onConvert,
}: {
  selected: SelectedWorkout;
  athleteId: number;
  weekStart: string;
  onClose: () => void;
  canLink: boolean;
  onMarkDone: (stravaActivityId: number) => void;
  onConvert: (newType: WorkoutType, newDurationMinutes: number) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [candidates, setCandidates] = useState<MatchCandidate[] | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [activityIdInput, setActivityIdInput] = useState('');
  const candidatesInFlight = useRef(false);
  const [convertTarget, setConvertTarget] = useState<ConvertibleSport | null>(null);
  const [converting, setConverting] = useState(false);
  const {settings} = useSettings();
  const {workout, dayIndex} = selected;
  const label = TYPE_LABELS[workout.type] ?? workout.type;

  const TYPE_CONFIG: Record<string, {color: string; icon: LucideIcon; iconColor: string; accent: string}> = {
    easy_run:     {color: 'border-accent-green/30 bg-accent-green/5',   icon: Activity,   iconColor: 'text-accent-green',  accent: COLORS.green},
    long_run:     {color: 'border-accent-green/30 bg-accent-green/5',   icon: TrendingUp, iconColor: 'text-accent-green',  accent: COLORS.green},
    tempo_run:    {color: 'border-accent-yellow/30 bg-accent-yellow/5', icon: Zap,        iconColor: 'text-accent-yellow', accent: COLORS.yellow},
    interval_run: {color: 'border-accent-red/30 bg-accent-red/5',       icon: Timer,      iconColor: 'text-accent-red',    accent: COLORS.red},
    recovery_run: {color: 'border-accent-cyan/30 bg-accent-cyan/5',       icon: Wind,       iconColor: 'text-accent-cyan',   accent: COLORS.cyan},
    gym:          {color: 'border-accent-orange/30 bg-accent-orange/5', icon: Dumbbell,   iconColor: 'text-accent-orange', accent: COLORS.orange},
    cycling:      {color: 'border-accent-blue/30 bg-accent-blue/5',     icon: Bike,       iconColor: 'text-accent-blue',   accent: COLORS.blue},
    yoga:         {color: 'border-accent-purple/30 bg-accent-purple/5', icon: Leaf,       iconColor: 'text-accent-purple', accent: COLORS.purple},
    cross_training:{color: 'border-accent-cyan/30 bg-accent-cyan/5',      icon: Shuffle,    iconColor: 'text-accent-cyan',   accent: COLORS.cyan},
    rest:         {color: 'border-[var(--color-rule)] bg-[var(--color-paper-2)]',            icon: Moon,       iconColor: 'text-[var(--color-ink-3)]',      accent: 'var(--color-ink-3)'},
    swim:         {color: 'border-accent-cyan/30 bg-accent-cyan/5',       icon: Waves,      iconColor: 'text-accent-cyan',   accent: COLORS.cyan},
    walk:         {color: 'border-accent-green/30 bg-accent-green/5',   icon: Footprints, iconColor: 'text-accent-green',  accent: COLORS.green},
    hike:         {color: 'border-accent-green/30 bg-accent-green/5',   icon: Mountain,   iconColor: 'text-accent-green',  accent: COLORS.green},
  };

  const cfg = TYPE_CONFIG[workout.type] ?? TYPE_CONFIG.rest;
  const WorkoutIcon = cfg.icon;

  // Parse specificInstructions into phases for structured display
  const phases = parsePhases(workout.specificInstructions);
  const structuredBlocks = parseStructuredSteps(workout.structuredSteps);

  // Parse zone number from intensityDescription for color coding
  const zoneColor = getZoneColor(workout.intensityDescription);

  return (
    <div className={`mt-3 rounded-2xl border p-4 ${cfg.color} animate-in slide-in-from-top-2 duration-200`}>
      {/* Header row */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--color-surface-1)] ${cfg.iconColor} flex-shrink-0`}>
            <WorkoutIcon className="w-4.5 h-4.5" style={{width: '18px', height: '18px'}} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--color-ink)]">{label}</span>
              {workout.completed && (
                <span className="text-xs text-accent-green font-medium bg-accent-green/10 px-2 py-0.5 rounded-full">✓ Done</span>
              )}
            </div>
            <div className="text-xs text-[var(--color-ink-3)] mt-0.5">
              {DAY_NAMES_FULL[dayIndex]}
              {workout.distanceKm && <span> · {workout.distanceKm} km</span>}
              {!workout.distanceKm && workout.durationMinutes && <span> · {workout.durationMinutes} min</span>}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-full bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] flex items-center justify-center transition-colors flex-shrink-0"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Effort badge */}
      {workout.intensityDescription && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-widest text-[var(--color-ink-3)] font-semibold mb-1.5">Effort</div>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${zoneColor}`}>
            {workout.intensityDescription}
          </span>
        </div>
      )}

      {/* Session breakdown */}
      {(structuredBlocks || workout.specificInstructions) && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--color-ink-3)] font-semibold mb-2">Session</div>
          {structuredBlocks ? (
            <StructuredWorkoutDisplay blocks={structuredBlocks} zones={settings.zones} />
          ) : (
            <div className="rounded-xl bg-[var(--color-surface-0)] border border-[var(--color-border)] overflow-hidden">
              {phases.map((phase, idx) => (
                <div key={idx} className={`flex gap-3 px-3 py-2.5 ${idx > 0 ? 'border-t border-[var(--color-border)]' : ''}`}>
                  <span className="w-5 h-5 rounded-full bg-[var(--color-surface-1)] flex items-center justify-center text-[10px] font-semibold text-[var(--color-ink-3)] flex-shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    {phase.label && (
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--color-ink-3)] mb-0.5">{phase.label}</div>
                    )}
                    <p className="text-sm text-[var(--color-ink)] leading-relaxed">{phase.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Convert to another sport */}
      {!workout.completed && CONVERTIBLE_RUN_TYPES.has(workout.type) && workout.durationMinutes && (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-widest text-[var(--color-ink-3)] font-semibold mb-1">Convert to another sport</div>
          <p className="text-[11px] text-[var(--color-ink-3)] mb-2.5">Maintain aerobic stimulus · lower impact</p>
          {convertTarget === null ? (
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CONVERT_SPORT_CONFIG) as ConvertibleSport[]).map(sport => {
                const duration = convertSession(workout.type, workout.durationMinutes!, settings.maxHr, settings.restingHr, sport);
                if (!duration) return null;
                const scfg = CONVERT_SPORT_CONFIG[sport];
                const Icon = scfg.icon;
                return (
                  <button
                    key={sport}
                    onClick={() => setConvertTarget(sport)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${scfg.color}`}
                  >
                    <Icon style={{width: '12px', height: '12px'}} />
                    {scfg.label} · {duration} min
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {(() => {
                const duration = convertSession(workout.type, workout.durationMinutes!, settings.maxHr, settings.restingHr, convertTarget);
                const scfg = CONVERT_SPORT_CONFIG[convertTarget];
                return (
                  <>
                    <span className="text-xs text-[var(--color-ink-2)]">
                      Convert to <span className="text-[var(--color-ink)] font-medium">{scfg.label} · {duration} min</span>?
                    </span>
                    <button
                      disabled={converting}
                      onClick={async () => {
                        if (!duration) return;
                        setConverting(true);
                        try {
                          const res = await fetch('/api/coach/week', {
                            method: 'PATCH',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({
                              athleteId,
                              weekStart,
                              date: selected.date,
                              workoutIndex: selected.workoutIndex,
                              type: SPORT_TO_WORKOUT_TYPE[convertTarget],
                              durationMinutes: duration,
                            }),
                          });
                          if (res.ok) {
                            onConvert(SPORT_TO_WORKOUT_TYPE[convertTarget], duration);
                            setConvertTarget(null);
                          }
                        } finally {
                          setConverting(false);
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[var(--color-paper-2)] border border-[var(--color-rule)] text-xs font-semibold text-[var(--color-ink)] hover:bg-[var(--color-paper-3)] transition-colors disabled:opacity-40"
                    >
                      {converting ? 'Saving…' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setConvertTarget(null)}
                      className="text-xs text-[var(--color-ink-3)] hover:text-[var(--color-ink)] transition-colors"
                    >
                      Cancel
                    </button>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Activity links */}
      {workout.completed && workout.linkedStravaActivityId && (
        <div className="mt-3 flex items-center gap-2">
          <a
            href={`/activities/${workout.linkedStravaActivityId}`}
            className="text-xs text-brand hover:underline"
          >
            View details
          </a>
          <span className="text-[var(--color-ink-3)]">·</span>
          <a
            href={`https://www.strava.com/activities/${workout.linkedStravaActivityId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[var(--color-ink-3)] hover:text-brand hover:underline"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
            Strava
          </a>
        </div>
      )}

      {/* Mark done */}
      {!workout.completed && canLink && !showPicker && (
        <button
          onClick={() => {
            if (candidatesInFlight.current) return;
            candidatesInFlight.current = true;
            setShowPicker(true);
            setLoadingCandidates(true);
            const params = new URLSearchParams({
              athleteId: String(athleteId),
              date: selected.date,
              plannedType: workout.type,
            });
            if (workout.distanceKm) params.set('plannedDistance', String(workout.distanceKm));
            if (workout.durationMinutes) params.set('plannedDuration', String(workout.durationMinutes));
            fetch(`/api/coach/match-candidates?${params.toString()}`)
              .then(r => r.json())
              .then((data: {candidates: MatchCandidate[]}) => setCandidates(data.candidates ?? []))
              .catch(() => setCandidates([]))
              .finally(() => { candidatesInFlight.current = false; setLoadingCandidates(false); });
          }}
          className="mt-3 text-xs text-[var(--color-ink-2)] hover:text-[var(--color-ink)] underline transition-colors"
        >
          Mark complete
        </button>
      )}
      {!workout.completed && canLink && showPicker && (
        <div className="mt-3 space-y-2.5">
          {loadingCandidates ? (
            <div className="flex items-center gap-2 text-xs text-[var(--color-ink-3)]">
              <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Finding your activities…
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-widest text-[var(--color-ink-3)] font-semibold">
                  {candidates && candidates.length > 0 ? 'Pick the matching activity' : 'No nearby activities'}
                </p>
                <button
                  onClick={() => { setShowPicker(false); setCandidates(null); setManualMode(false); setActivityIdInput(''); }}
                  className="text-[10px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)] transition-colors uppercase tracking-wider"
                >
                  Cancel
                </button>
              </div>

              {candidates && candidates.length > 0 && !manualMode && (
                <div className="space-y-1.5">
                  {candidates.slice(0, 5).map(c => {
                    const CandidateIcon = ACTIVITY_TYPE_ICON[c.type] ?? Activity;
                    return (
                      <button
                        key={c.id}
                        onClick={() => { if (!c.alreadyLinked) onMarkDone(c.id); }}
                        disabled={c.alreadyLinked}
                        className={`w-full text-left rounded-xl border px-3 py-2 transition-all ${
                          c.alreadyLinked
                            ? 'border-[var(--color-border)] bg-[var(--color-surface-0)] opacity-50 cursor-not-allowed'
                            : c.isBestMatch
                              ? 'border-accent-green/40 bg-accent-green/10 hover:bg-accent-green/15'
                              : 'border-[var(--color-border)] bg-[var(--color-surface-0)] hover:bg-[var(--color-surface-1)] hover:border-[var(--color-border)]'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <CandidateIcon className="w-4 h-4 mt-0.5 text-[var(--color-ink-2)] flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium text-[var(--color-ink)] truncate">{c.name}</span>
                              {c.isBestMatch && (
                                <span className="text-[9px] uppercase tracking-wider text-accent-green font-bold bg-accent-green/15 px-1.5 py-0.5 rounded">Best match</span>
                              )}
                              {c.alreadyLinked && (
                                <span className="text-[9px] uppercase tracking-wider text-[var(--color-ink-3)] font-medium bg-[var(--color-surface-1)] px-1.5 py-0.5 rounded">Already linked</span>
                              )}
                            </div>
                            <div className="text-xs text-[var(--color-ink-2)] mt-0.5 flex items-center gap-1.5 flex-wrap">
                              {c.distanceKm > 0 && <span>{c.distanceKm} km</span>}
                              {c.durationMin > 0 && <span>· {c.durationMin >= 60 ? `${Math.floor(c.durationMin/60)}h ${c.durationMin%60}m` : `${c.durationMin}min`}</span>}
                              {c.avgPace && <span>· {c.avgPace}</span>}
                              {c.startTime && <span className="text-[var(--color-ink-3)]">· {c.startTime}</span>}
                              {c.date !== selected.date && <span className="text-[var(--color-ink-3)]">· {c.date}</span>}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {!manualMode && (
                <button
                  onClick={() => setManualMode(true)}
                  className="text-xs text-[var(--color-ink-3)] hover:text-[var(--color-ink)] underline transition-colors"
                >
                  {candidates && candidates.length > 0 ? "Don't see it? Enter ID manually" : 'Enter ID manually'}
                </button>
              )}

              {manualMode && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="number"
                    placeholder="e.g. 14823650471"
                    value={activityIdInput}
                    onChange={e => setActivityIdInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && activityIdInput) {
                        onMarkDone(Number(activityIdInput));
                      }
                    }}
                    aria-label="Activity ID"
                    className="flex-1 bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--color-ink)] placeholder-white/25 focus:outline-none focus:border-[var(--color-accent)]/50 font-mono"
                    autoFocus
                  />
                  <button
                    onClick={() => { if (activityIdInput) onMarkDone(Number(activityIdInput)); }}
                    disabled={!activityIdInput}
                    className="px-3 py-1.5 rounded-lg bg-accent-green/20 border border-accent-green/30 text-accent-green text-xs font-semibold hover:bg-accent-green/30 transition-colors disabled:opacity-40"
                  >
                    Link
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
