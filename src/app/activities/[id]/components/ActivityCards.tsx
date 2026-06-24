'use client';

import {motion} from 'framer-motion';
import {useActivityZoneBreakdown} from '@/hooks/useStrava';
import {calcTrainingLoad, calcTrainingLoadFromZones} from '@/utils/trainingLoad';
import type {FitnessDataPoint} from '@/utils/trainingLoad';
import type {ActivitySummary, UserSettings} from '@/lib/activityModel';
import {formatDuration, ZONE_COLORS, ZONE_NAMES, COLORS} from '@/lib/activityModel';

// ─── Zone breakdown ───────────────────────────────────────────────────────────

export function ZoneCard({breakdown}: {breakdown: ReturnType<typeof useActivityZoneBreakdown>['data']}) {
  if (!breakdown) return (
    <div className="py-8 text-center">
      <p className="text-xs text-[var(--faint)]">No HR data for zone breakdown</p>
    </div>
  );

  const totalTime = Object.values(breakdown.zones).reduce((s, z) => s + z.time, 0);
  if (totalTime === 0) return null;

  return (
    <div className="space-y-3">
      {([1, 2, 3, 4, 5, 6] as const).map((z) => {
        const zone = breakdown.zones[z];
        const pct = zone ? Math.round((zone.time / totalTime) * 100) : 0;
        const zColor = ZONE_COLORS[z];
        return (
          <div key={z}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[var(--dim)] font-medium">Z{z} · {ZONE_NAMES[z]}</span>
              <span className="text-[11px] text-[var(--faint)]">{pct}% · {formatDuration(zone?.time ?? 0)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--panel)] overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{background: zColor}}
                initial={{width: 0}}
                animate={{width: `${pct}%`}}
                transition={{duration: 0.5, delay: z * 0.05, ease: 'easeOut'}}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Training Load / fatigue impact ───────────────────────────────────────────

const tlLabel = (tl: number): {text: string; color: string} => {
  if (tl < 50) return {text: 'Light · easy aerobic load', color: COLORS.green};
  if (tl < 120) return {text: 'Moderate · solid session', color: COLORS.green};
  if (tl < 250) return {text: 'Hard · meaningful stimulus', color: COLORS.yellow};
  return {text: 'Very hard · big fatigue spike', color: COLORS.red};
};

export function TrainingLoadCard({
  breakdown,
  summary,
  zones,
  restingHr,
  maxHr,
  fitnessData,
  activityDate,
}: {
  breakdown: ReturnType<typeof useActivityZoneBreakdown>['data'];
  summary: ActivitySummary | undefined;
  zones: UserSettings['zones'];
  restingHr: number;
  maxHr: number;
  fitnessData: FitnessDataPoint[] | undefined;
  activityDate: string | undefined;
}) {
  // Per-activity Training Load: prefer true time-in-zone, else avg-HR fallback.
  const hasZones = breakdown && Object.values(breakdown.zones).some((z) => z.time > 0);
  const tl = hasZones
    ? calcTrainingLoadFromZones(breakdown!.zones)
    : summary && summary.avgHr > 0
    ? calcTrainingLoad(summary.duration, summary.avgHr, restingHr, maxHr, zones)
    : null;

  if (tl === null) {
    return (
      <p className="text-sm text-[var(--faint)]">n/a, no HR data for this activity</p>
    );
  }

  const tlRounded = Math.round(tl);
  const label = tlLabel(tl);

  // Day-level fatigue impact, read from the cached fitness series.
  let impact: {dAtl: number; tsbBefore: number; tsbAfter: number} | null = null;
  if (fitnessData && activityDate) {
    const i = fitnessData.findIndex((p) => p.date === activityDate);
    if (i > 0) {
      const cur = fitnessData[i];
      const prev = fitnessData[i - 1];
      impact = {
        dAtl: Number((cur.atl - prev.atl).toFixed(1)),
        tsbBefore: prev.tsb,
        tsbAfter: cur.tsb,
      };
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-bold font-mono tabular-nums" style={{color: label.color}}>
          {tlRounded}
        </span>
        <div>
          <p className="text-xs text-[var(--dim)] font-medium">{label.text}</p>
          <p className="text-[10px] text-[var(--faint)] mt-0.5">
            Training Load{hasZones ? ' · from HR stream' : ' · estimated from avg HR'}
          </p>
        </div>
      </div>

      {impact && (
        <div className="pt-3 border-t border-[var(--color-border)] grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-[var(--faint)] uppercase tracking-wide mb-1">Fatigue (ATL)</p>
            <p
              className="text-lg font-bold font-mono tabular-nums"
              style={{color: impact.dAtl > 0 ? COLORS.yellow : 'var(--color-text-2)'}}
            >
              {impact.dAtl > 0 ? '+' : ''}{impact.dAtl}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--faint)] uppercase tracking-wide mb-1">Freshness (TSB)</p>
            <p className="text-lg font-bold font-mono tabular-nums text-[var(--text)]">
              {impact.tsbBefore.toFixed(0)}
              <span className="text-[var(--faint)] mx-1">→</span>
              <span style={{color: impact.tsbAfter < impact.tsbBefore ? COLORS.red : COLORS.green}}>
                {impact.tsbAfter.toFixed(0)}
              </span>
            </p>
          </div>
          <p className="col-span-2 text-[10px] text-[var(--faint)] leading-relaxed">
            Net effect on the day this activity was logged (includes any other activities that day).
          </p>
        </div>
      )}
    </div>
  );
}
