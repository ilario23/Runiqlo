'use client';

import {motion, type Variants} from 'framer-motion';
import Link from 'next/link';
import {Skeleton} from '@/components/ui/skeleton';
import {useAdherence, useActivityStreams} from '@/hooks/useStrava';
import {useSettings} from '@/contexts/SettingsContext';
import {formatPace} from '@/lib/activityModel';
import type {StreamPoint, UserSettings} from '@/lib/activityModel';
import type {WorkoutBlock, WorkoutType} from '@/lib/coachTypes';

const cardVariant: Variants = {
  hidden: {opacity: 0},
  show: {opacity: 1, transition: {duration: 0.3, ease: 'easeOut'}},
};

const TYPE_LABEL: Record<WorkoutType, string> = {
  easy_run: 'Easy Run',
  long_run: 'Long Run',
  tempo_run: 'Tempo Run',
  interval_run: 'Intervals',
  recovery_run: 'Recovery Run',
  gym: 'Gym',
  cycling: 'Cycling',
  yoga: 'Yoga',
  cross_training: 'Cross Train',
  rest: 'Rest',
  swim: 'Swim',
  walk: 'Walk',
  hike: 'Hike',
};

const TYPE_COLOR: Record<WorkoutType, string> = {
  easy_run:      'text-accent-green border-accent-green/30 bg-accent-green/8',
  long_run:      'text-accent-green border-accent-green/30 bg-accent-green/8',
  tempo_run:     'text-accent-yellow border-accent-yellow/30 bg-accent-yellow/8',
  interval_run:  'text-accent-red border-accent-red/30 bg-accent-red/8',
  recovery_run:  'text-accent-cyan border-accent-cyan/30 bg-accent-cyan/8',
  gym:           'text-accent-orange border-accent-orange/30 bg-accent-orange/8',
  cycling:       'text-accent-blue border-accent-blue/30 bg-accent-blue/8',
  yoga:          'text-accent-purple border-accent-purple/30 bg-accent-purple/8',
  cross_training:'text-accent-cyan border-accent-cyan/30 bg-accent-cyan/8',
  rest:          'text-[var(--color-ink-3)] border-[var(--color-rule)] bg-[var(--color-paper)]/4',
  swim:          'text-accent-cyan border-accent-cyan/30 bg-accent-cyan/8',
  walk:          'text-accent-green border-accent-green/30 bg-accent-green/8',
  hike:          'text-accent-green border-accent-green/30 bg-accent-green/8',
};

// Global target zone for workouts without structuredSteps
const TYPE_TARGET_ZONE: Partial<Record<WorkoutType, number>> = {
  recovery_run: 1,
  easy_run: 2,
  long_run: 2,
  tempo_run: 3,
  interval_run: 4,
};

// ─── Section-based HR analysis ────────────────────────────────────────────────

type SectionResult = {
  phase: 'warmup' | 'training' | 'rest' | 'cooldown';
  label: string;
  bpmTarget: string;
  actualAvgHr: number | null;
  adherencePct: number | null;
  plannedSec: number;
};

function buildSections(
  blocks: WorkoutBlock[],
  streams: StreamPoint[],
  settings: UserSettings,
): SectionResult[] {
  // Flatten blocks into ordered steps with cumulative time windows
  type FlatStep = {
    phase: 'warmup' | 'training' | 'rest' | 'cooldown';
    startSec: number;
    endSec: number;
    zoneNumber: number | undefined;
    bpmMin: number | undefined;
    bpmMax: number | undefined;
  };

  const flatSteps: FlatStep[] = [];
  let t = 0;

  for (const block of blocks) {
    if ('repeatCount' in block) {
      for (let r = 0; r < block.repeatCount; r++) {
        for (const step of block.steps) {
          flatSteps.push({
            phase: step.stepType,
            startSec: t,
            endSec: t + step.durationSeconds,
            zoneNumber: step.zoneNumber,
            bpmMin: step.bpmMin,
            bpmMax: step.bpmMax,
          });
          t += step.durationSeconds;
        }
      }
    } else {
      flatSteps.push({
        phase: block.stepType,
        startSec: t,
        endSec: t + block.durationSeconds,
        zoneNumber: block.zoneNumber,
        bpmMin: block.bpmMin,
        bpmMax: block.bpmMax,
      });
      t += block.durationSeconds;
    }
  }

  const phaseOrder: Array<'warmup' | 'training' | 'rest' | 'cooldown'> = [
    'warmup', 'training', 'rest', 'cooldown',
  ];
  const phaseLabels = {warmup: 'Warmup', training: 'Main Set', rest: 'Rest', cooldown: 'Cooldown'};

  const results: SectionResult[] = [];

  for (const phase of phaseOrder) {
    const phaseSteps = flatSteps.filter(s => s.phase === phase);
    if (!phaseSteps.length) continue;

    // Collect HR readings from the stream for each step's time window
    const hrReadings: number[] = [];
    for (const step of phaseSteps) {
      for (const pt of streams) {
        if (pt.time >= step.startSec && pt.time < step.endSec && pt.heartrate > 0) {
          hrReadings.push(pt.heartrate);
        }
      }
    }

    const actualAvgHr = hrReadings.length > 0
      ? Math.round(hrReadings.reduce((s, v) => s + v, 0) / hrReadings.length)
      : null;

    // Resolve BPM target: prefer explicit bpmMin/bpmMax, fall back to zone settings
    const rep = phaseSteps[0];
    let bpmMin = rep.bpmMin;
    let bpmMax = rep.bpmMax;
    const zoneNumber = rep.zoneNumber;

    if ((!bpmMin || !bpmMax) && zoneNumber) {
      const key = `z${zoneNumber}` as keyof typeof settings.zones;
      const bounds = settings.zones[key];
      if (bounds) { bpmMin = bounds[0]; bpmMax = bounds[1]; }
    }

    const bpmTarget = bpmMin && bpmMax
      ? `${bpmMin}–${bpmMax}`
      : zoneNumber ? `Z${zoneNumber}` : '—';

    // Adherence: % of readings within target range (5 bpm tolerance)
    let adherencePct: number | null = null;
    if (hrReadings.length > 0 && bpmMin && bpmMax) {
      const tol = 5;
      const inRange = hrReadings.filter(hr => hr >= bpmMin! - tol && hr <= bpmMax! + tol).length;
      adherencePct = Math.round((inRange / hrReadings.length) * 100);
    }

    const plannedSec = phaseSteps.reduce((s, st) => s + (st.endSec - st.startSec), 0);
    results.push({phase, label: phaseLabels[phase], bpmTarget, actualAvgHr, adherencePct, plannedSec});
  }

  return results;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function pctScore(actual: number, planned: number): number {
  return Math.min(150, Math.round((actual / planned) * 100));
}

function badgeClass(pct: number | null): string {
  if (pct === null) return 'text-[var(--color-ink-3)]';
  if (pct >= 90) return 'text-accent-green';
  if (pct >= 70) return 'text-accent-yellow';
  return 'text-accent-red';
}

function fmtPace(minPerKm: number): string {
  return `${formatPace(minPerKm)}/km`;
}

function fmtMin(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}min`;
}

// ─── Row components ───────────────────────────────────────────────────────────

function MetricRow({label, planned, actual, pct}: {label: string; planned: string; actual: string; pct: number | null}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center py-2 border-b border-[var(--color-rule)] last:border-0">
      <span className="text-[11px] text-[var(--color-ink-2)]">{label}</span>
      <span className="text-[11px] text-[var(--color-ink-3)] tabular-nums">{planned}</span>
      <span className="text-[11px] text-[var(--color-ink)] tabular-nums font-medium">{actual}</span>
      <span className={`text-[11px] font-semibold tabular-nums w-8 text-right ${badgeClass(pct)}`}>
        {pct !== null ? `${pct}%` : '—'}
      </span>
    </div>
  );
}

function SectionRow({section}: {section: SectionResult}) {
  const phaseDim = section.phase === 'rest' ? 'text-[var(--color-ink-3)]' : 'text-[var(--color-ink-2)]';
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center py-1.5 border-b border-[var(--color-rule)] last:border-0">
      <span className={`text-[11px] ${phaseDim}`}>{section.label}</span>
      <span className="text-[11px] text-[var(--color-ink-3)] tabular-nums">{section.bpmTarget}</span>
      <span className="text-[11px] text-[var(--color-ink-2)] tabular-nums font-medium">
        {section.actualAvgHr ? `${section.actualAvgHr} bpm` : '—'}
      </span>
      <span className={`text-[11px] font-semibold tabular-nums w-8 text-right ${badgeClass(section.adherencePct)}`}>
        {section.adherencePct !== null ? `${section.adherencePct}%` : '—'}
      </span>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface Props {
  activityId: string;
  actualDistanceKm: number;
  actualMovingTimeSecs: number;
}

export default function PlanAdherencePanel({activityId, actualDistanceKm, actualMovingTimeSecs}: Props) {
  const {data, isLoading: adherenceLoading} = useAdherence(activityId);
  const {data: streams, isLoading: streamsLoading} = useActivityStreams(activityId);
  const {settings} = useSettings();

  if (adherenceLoading) {
    return (
      <motion.div variants={cardVariant} className="surface-card p-5">
        <Skeleton className="h-32 w-full" />
      </motion.div>
    );
  }

  if (!data) return null;

  const {plannedWorkout, weekStart, zoneBreakdown} = data;
  const hasStructuredSteps = (plannedWorkout.structuredSteps?.length ?? 0) > 0;

  // ── Distance ─────────────────────────────────────────────────────────────────
  const distPct = plannedWorkout.distanceKm && actualDistanceKm > 0
    ? pctScore(actualDistanceKm, plannedWorkout.distanceKm)
    : null;

  // ── Duration ─────────────────────────────────────────────────────────────────
  const plannedSecs = plannedWorkout.durationMinutes ? plannedWorkout.durationMinutes * 60 : null;
  const durPct = plannedSecs && actualMovingTimeSecs > 0
    ? pctScore(actualMovingTimeSecs, plannedSecs)
    : null;

  // ── Pace (informational, no score — direction depends on workout type) ───────
  const plannedPace = plannedWorkout.distanceKm && plannedWorkout.durationMinutes
    ? plannedWorkout.durationMinutes / plannedWorkout.distanceKm
    : null;
  const actualPace = actualDistanceKm > 0 && actualMovingTimeSecs > 0
    ? actualMovingTimeSecs / 60 / actualDistanceKm
    : null;

  // ── HR: section-based (structured) vs global (unstructured) ─────────────────
  let hrPct: number | null = null;
  let sections: SectionResult[] | null = null;

  if (hasStructuredSteps && streams && !streamsLoading) {
    sections = buildSections(plannedWorkout.structuredSteps!, streams, settings);
    // Score from training sections only — rest/warmup/cooldown are not the key effort
    const trainingSections = sections.filter(s => s.phase === 'training' && s.adherencePct !== null);
    if (trainingSections.length > 0) {
      const totalSec = trainingSections.reduce((s, x) => s + x.plannedSec, 0);
      hrPct = totalSec > 0
        ? Math.round(
            trainingSections.reduce((s, x) => s + x.adherencePct! * (x.plannedSec / totalSec), 0),
          )
        : null;
    }
  } else if (!hasStructuredSteps) {
    // Global zone check for unstructured workouts (easy/long/recovery)
    const targetZone = TYPE_TARGET_ZONE[plannedWorkout.type] ?? null;
    if (targetZone && zoneBreakdown) {
      const totalTime = Object.values(zoneBreakdown).reduce((s, z) => s + z.time, 0);
      if (totalTime > 0) {
        const adjacent = new Set([targetZone - 1, targetZone, targetZone + 1].filter(z => z >= 1 && z <= 6));
        const creditedTime = Object.entries(zoneBreakdown)
          .filter(([z]) => adjacent.has(Number(z)))
          .reduce((s, [, v]) => s + v.time, 0);
        hrPct = Math.min(100, Math.round((creditedTime / totalTime) * 100));
      }
    }
  }

  // ── Overall score (distance 40%, duration 30%, HR 30%) ───────────────────────
  const scored: {val: number; weight: number}[] = [];
  if (distPct !== null) scored.push({val: distPct, weight: 0.4});
  if (durPct !== null) scored.push({val: durPct, weight: 0.3});
  if (hrPct !== null) scored.push({val: hrPct, weight: 0.3});

  let overallPct: number | null = null;
  if (scored.length > 0) {
    const totalWeight = scored.reduce((s, x) => s + x.weight, 0);
    overallPct = Math.min(100, Math.round(
      scored.reduce((s, x) => s + x.val * (x.weight / totalWeight), 0),
    ));
  }

  const typeColor = TYPE_COLOR[plannedWorkout.type] ?? TYPE_COLOR.rest;
  const typeLabel = TYPE_LABEL[plannedWorkout.type] ?? plannedWorkout.type;
  const fmtWeekStart = new Date(weekStart + 'T00:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'});

  return (
    <motion.div variants={cardVariant} className="surface-card p-5">
      <h2 className="text-xs font-medium text-[var(--color-ink-3)] uppercase tracking-wide mb-3">Plan Adherence</h2>

      {/* Workout type pill */}
      <div className="mb-3">
        <span className={`inline-flex text-xs font-semibold uppercase rounded-lg px-2 py-1 border ${typeColor}`}>
          {typeLabel}
        </span>
        <p className="text-[11px] text-[var(--color-ink-3)] mt-1.5 leading-snug">{plannedWorkout.intensityDescription}</p>
      </div>

      {/* Distance / Duration / Pace rows */}
      <div className="mb-3">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 pb-1 mb-1 border-b border-[var(--color-rule)]">
          <span className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wide">Metric</span>
          <span className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wide">Plan</span>
          <span className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wide">Actual</span>
          <span className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wide w-8 text-right">%</span>
        </div>
        <MetricRow
          label="Distance"
          planned={plannedWorkout.distanceKm ? `${plannedWorkout.distanceKm} km` : '—'}
          actual={actualDistanceKm > 0 ? `${actualDistanceKm.toFixed(2)} km` : '—'}
          pct={distPct}
        />
        <MetricRow
          label="Duration"
          planned={plannedWorkout.durationMinutes ? `${plannedWorkout.durationMinutes} min` : '—'}
          actual={actualMovingTimeSecs > 0 ? fmtMin(actualMovingTimeSecs) : '—'}
          pct={durPct}
        />
        <MetricRow
          label="Pace"
          planned={plannedPace ? fmtPace(plannedPace) : '—'}
          actual={actualPace ? fmtPace(actualPace) : '—'}
          pct={null}
        />
      </div>

      {/* HR section — section-based for structured workouts, global for others */}
      {hasStructuredSteps ? (
        <div className="mb-3">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 pb-1 mb-1 border-b border-[var(--color-rule)]">
            <span className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wide">Phase</span>
            <span className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wide">Target</span>
            <span className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wide">Avg HR</span>
            <span className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wide w-8 text-right">%</span>
          </div>
          {streamsLoading ? (
            <p className="text-[11px] text-[var(--color-ink-3)] py-2">Analysing sections…</p>
          ) : sections && sections.length > 0 ? (
            sections.map(s => <SectionRow key={s.phase} section={s} />)
          ) : (
            <p className="text-[11px] text-[var(--color-ink-3)] py-2">No HR data</p>
          )}
        </div>
      ) : TYPE_TARGET_ZONE[plannedWorkout.type] ? (
        <div className="mb-3">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 pb-1 mb-1 border-b border-[var(--color-rule)]">
            <span className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wide">HR Zone</span>
            <span className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wide">Plan</span>
            <span className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wide">Actual</span>
            <span className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wide w-8 text-right">%</span>
          </div>
          {(() => {
            const targetZone = TYPE_TARGET_ZONE[plannedWorkout.type]!;
            let dominantZone: number | null = null;
            let dominantPct: number | null = null;
            if (zoneBreakdown) {
              const totalTime = Object.values(zoneBreakdown).reduce((s, z) => s + z.time, 0);
              let maxTime = 0;
              for (const [z, v] of Object.entries(zoneBreakdown)) {
                if (v.time > maxTime) { maxTime = v.time; dominantZone = Number(z); }
              }
              dominantPct = dominantZone && totalTime > 0
                ? Math.round(((zoneBreakdown[String(dominantZone)]?.time ?? 0) / totalTime) * 100)
                : null;
            }
            return (
              <MetricRow
                label="Zone"
                planned={`Zone ${targetZone}`}
                actual={dominantZone && dominantPct ? `${dominantPct}% Z${dominantZone}` : '—'}
                pct={hrPct}
              />
            );
          })()}
        </div>
      ) : null}

      {/* Overall score */}
      <div className="border-t border-[var(--color-rule)] pt-3 flex items-center justify-between">
        <span className="text-[11px] text-[var(--color-ink-3)]">Overall Adherence</span>
        <span className={`text-xl font-bold tabular-nums ${badgeClass(overallPct)}`}>
          {overallPct !== null ? `${overallPct}%` : '—'}
        </span>
      </div>

      <div className="mt-2.5">
        <Link href={`/plan?week=${weekStart}`} className="text-[11px] text-[var(--color-ink-3)] hover:text-[var(--color-ink-2)] transition-colors">
          Week of {fmtWeekStart} →
        </Link>
      </div>
    </motion.div>
  );
}
