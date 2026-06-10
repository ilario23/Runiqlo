'use client';

import {useMemo, useState, useEffect} from 'react';
import {
  AreaChart,
  Area,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import {formatPace, COLORS} from '@/lib/activityModel';

// ─── Chart types ──────────────────────────────────────────────────────────────

export interface ChartPoint {
  idx: number;
  dist: number;
  elevation?: number;
  hr?: number;
  pace?: number;
  cadence?: number;
  lat?: number;
  lng?: number;
}

type TooltipPayload = Array<{payload?: ChartPoint; value?: unknown; dataKey?: string}>;

// ─── Tooltip content components (module-level so identity is stable) ──────────
// recharts v3 cloneElement's these — they must be proper React components
// so we can use useEffect to fire the hover callback without render-phase side effects.

function ElevTooltip({
  active,
  payload,
  onHover,
}: {
  active?: boolean;
  payload?: TooltipPayload;
  onHover: (idx: number | null) => void;
}) {
  const activeIdx = active && payload?.length ? (payload[0]?.payload?.idx ?? null) : null;
  useEffect(() => { onHover(activeIdx); }, [activeIdx, onHover]);
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;
  return (
    <div className="surface-card px-2.5 py-1.5 text-[11px]">
      <p className="text-[var(--color-ink-2)]">{pt.dist.toFixed(2)} km</p>
      <p className="text-[var(--color-ink)] font-medium">{Math.round(Number(payload[0]?.value))} m</p>
    </div>
  );
}

function PaceHRTooltip({
  active,
  payload,
  onHover,
  color,
}: {
  active?: boolean;
  payload?: TooltipPayload;
  onHover: (idx: number | null) => void;
  color: string;
}) {
  const activeIdx = active && payload?.length ? (payload[0]?.payload?.idx ?? null) : null;
  useEffect(() => { onHover(activeIdx); }, [activeIdx, onHover]);
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;
  const hrEntry = payload.find((p) => p.dataKey === 'hr');
  const paceEntry = payload.find((p) => p.dataKey === 'pace');
  const cadenceEntry = payload.find((p) => p.dataKey === 'cadence');
  const hr = hrEntry?.value != null ? Math.round(Number(hrEntry.value)) : null;
  const pace = paceEntry?.value != null ? Number(paceEntry.value) : null;
  const cadence = cadenceEntry?.value != null ? Math.round(Number(cadenceEntry.value)) : null;
  if (hr == null && (pace == null || pace <= 0) && cadence == null) return null;
  return (
    <div className="surface-card px-2.5 py-1.5 text-[11px] space-y-0.5">
      <p className="text-[var(--color-ink-2)]">{pt.dist.toFixed(2)} km</p>
      {pace != null && pace > 0 && (
        <p style={{color}} className="font-medium">{formatPace(pace)}/km</p>
      )}
      {hr != null && (
        <p style={{color: COLORS.red}} className="font-medium">{hr} bpm</p>
      )}
      {cadence != null && (
        <p style={{color: COLORS.purple}} className="font-medium">{cadence} spm</p>
      )}
    </div>
  );
}

// ─── Individual chart panels ──────────────────────────────────────────────────

interface ChartPanelProps {
  data: ChartPoint[];
  color: string;
  onHover: (idx: number | null) => void;
  syncId: string;
}

function ElevationPanel({data, color, onHover, syncId}: ChartPanelProps) {
  const hasElevation = data.some((p) => p.elevation != null);

  const {elevDomain, elevTicks} = useMemo(() => {
    const vals = data.flatMap((p) => (p.elevation != null ? [p.elevation] : []));
    if (vals.length === 0) return {elevDomain: ['auto', 'auto'] as ['auto', 'auto'], elevTicks: undefined};
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min;
    const step = range <= 100 ? 25 : range <= 300 ? 50 : range <= 700 ? 100 : range <= 1500 ? 200 : 500;
    const start = Math.ceil(min / step) * step;
    const ticks: number[] = [];
    for (let v = start; v <= max; v += step) ticks.push(v);
    return {elevDomain: [min, max] as [number, number], elevTicks: ticks.length ? ticks : [min, max]};
  }, [data]);

  if (!hasElevation) return null;
  return (
    <div>
      <p className="text-[10px] text-[var(--color-ink-3)] uppercase tracking-wide mb-1.5">Elevation</p>
      <div className="h-[100px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            syncId={syncId}
            margin={{top: 2, right: 36, left: -28, bottom: 0}}
            onMouseLeave={() => onHover(null)}
          >
            <defs>
              <linearGradient id="gradElev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="dist" tick={{fill: 'rgba(26,24,20,0.25)', fontSize: 8}} tickFormatter={(v) => `${(v as number).toFixed(0)}km`} axisLine={false} tickLine={false} minTickGap={50} />
            <YAxis yAxisId="elev" domain={elevDomain} ticks={elevTicks} tick={{fill: 'rgba(26,24,20,0.25)', fontSize: 8}} axisLine={false} tickLine={false} tickFormatter={(v) => `${v as number}m`} width={40} />
            <YAxis yAxisId="elevR" orientation="right" domain={elevDomain} ticks={elevTicks} tick={{fill: 'rgba(26,24,20,0.25)', fontSize: 8}} axisLine={false} tickLine={false} tickFormatter={(v) => `${v as number}m`} width={32} />
            <RechartsTooltip
              content={<ElevTooltip onHover={onHover} />}
              cursor={{stroke: 'rgba(26,24,20,0.08)'}}
            />
            <Area yAxisId="elev" type="monotone" dataKey="elevation" stroke={color} strokeWidth={1.5} fill="url(#gradElev)" dot={false} activeDot={{r: 3, fill: color, strokeWidth: 0}} />
            {/* Invisible area bound to right axis so recharts renders its ticks */}
            <Area yAxisId="elevR" type="monotone" dataKey="elevation" stroke="none" fill="none" dot={false} activeDot={false} legendType="none" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PaceHRPanel({data, color, onHover, syncId}: ChartPanelProps) {
  const hasHR = data.some((p) => p.hr != null);
  const hasPace = data.some((p) => p.pace != null);
  const hasCadence = data.some((p) => p.cadence != null);

  const [showPace, setShowPace] = useState(true);
  const [showHR, setShowHR] = useState(true);
  const [showCadence, setShowCadence] = useState(false);

  const paceDomain = useMemo((): [number, number] | undefined => {
    if (!hasPace) return undefined;
    const vals = data.flatMap((p) => (p.pace != null && p.pace > 0 ? [p.pace] : []));
    if (vals.length < 4) return undefined;
    const sorted = [...vals].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    return [sorted[0], q3 + 1.5 * iqr];
  }, [data, hasPace]);

  const cadenceDomain = useMemo((): [number, number] | undefined => {
    if (!hasCadence) return undefined;
    const vals = data.flatMap((p) => (p.cadence != null ? [p.cadence] : []));
    if (vals.length < 4) return undefined;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.1;
    return [Math.max(0, min - pad), max + pad];
  }, [data, hasCadence]);

  const rightMargin = (hasHR && showHR ? 32 : 0) + (hasCadence && showCadence ? 32 : 0) + 4;

  if (!hasHR && !hasPace && !hasCadence) return null;
  return (
    <div>
      <div className="flex items-center gap-3 mb-1.5">
        {hasPace && (
          <button
            onClick={() => setShowPace((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide transition-opacity"
            style={{opacity: showPace ? 1 : 0.3, color: 'rgba(26,24,20,0.5)'}}
          >
            <span className="w-3 h-[2px] rounded-full inline-block" style={{background: color}} />
            Pace
          </button>
        )}
        {hasHR && (
          <button
            onClick={() => setShowHR((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide transition-opacity"
            style={{opacity: showHR ? 1 : 0.3, color: 'rgba(26,24,20,0.5)'}}
          >
            <span className="w-3 h-[2px] rounded-full inline-block" style={{background: COLORS.red}} />
            HR
          </button>
        )}
        {hasCadence && (
          <button
            onClick={() => setShowCadence((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide transition-opacity"
            style={{opacity: showCadence ? 1 : 0.3, color: 'rgba(26,24,20,0.5)'}}
          >
            <span className="w-3 h-[2px] rounded-full inline-block" style={{background: COLORS.purple}} />
            Cadence
          </button>
        )}
      </div>
      <div className="h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            syncId={syncId}
            margin={{top: 2, right: rightMargin, left: -28, bottom: 0}}
            onMouseLeave={() => onHover(null)}
          >
            <defs>
              <linearGradient id="gradHRCombo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.red} stopOpacity={0.2} />
                <stop offset="95%" stopColor={COLORS.red} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="dist" tick={{fill: 'rgba(26,24,20,0.25)', fontSize: 8}} tickFormatter={(v) => `${(v as number).toFixed(0)}km`} axisLine={false} tickLine={false} minTickGap={50} />
            <YAxis
              yAxisId="pace"
              reversed
              hide={!hasPace || !showPace}
              domain={paceDomain}
              allowDataOverflow
              tick={{fill: 'rgba(26,24,20,0.25)', fontSize: 8}}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (Number(v) > 0 ? formatPace(Number(v)) : '')}
              width={40}
            />
            <YAxis
              yAxisId="hr"
              orientation="right"
              hide={!hasHR || !showHR}
              domain={[100, 200]}
              allowDataOverflow
              tick={{fill: 'rgba(26,24,20,0.25)', fontSize: 8}}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v as number}`}
              width={32}
            />
            <YAxis
              yAxisId="cadence"
              orientation="right"
              hide={!hasCadence || !showCadence}
              domain={cadenceDomain}
              allowDataOverflow
              tick={{fill: 'rgba(26,24,20,0.25)', fontSize: 8}}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v as number}`}
              width={32}
            />
            <RechartsTooltip
              content={<PaceHRTooltip onHover={onHover} color={color} />}
              cursor={{stroke: 'rgba(26,24,20,0.08)'}}
            />
            {hasHR && showHR && (
              <Area
                yAxisId="hr"
                type="monotone"
                dataKey="hr"
                stroke={COLORS.red}
                strokeWidth={1.5}
                fill="url(#gradHRCombo)"
                dot={false}
                activeDot={{r: 3, fill: COLORS.red, strokeWidth: 0}}
              />
            )}
            {hasPace && showPace && (
              <Line
                yAxisId="pace"
                type="monotone"
                dataKey="pace"
                stroke={color}
                strokeWidth={1.5}
                dot={false}
                activeDot={{r: 3, fill: color, strokeWidth: 0}}
              />
            )}
            {hasCadence && showCadence && (
              <Line
                yAxisId="cadence"
                type="monotone"
                dataKey="cadence"
                stroke={COLORS.purple}
                strokeWidth={1.5}
                dot={false}
                activeDot={{r: 3, fill: COLORS.purple, strokeWidth: 0}}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Stream Charts ─────────────────────────────────────────────────────────────

interface StreamChartsProps {
  chartData: ChartPoint[];
  color: string;
  onHover: (idx: number | null) => void;
}

export default function StreamCharts({chartData, color, onHover}: StreamChartsProps) {
  const syncId = 'activity-charts';
  return (
    <div className="space-y-5">
      <ElevationPanel data={chartData} color={color} onHover={onHover} syncId={syncId} />
      <PaceHRPanel data={chartData} color={color} onHover={onHover} syncId={syncId} />
    </div>
  );
}
