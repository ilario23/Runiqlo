'use client';

import {useMemo, useState} from 'react';
import type {FitnessDataPoint} from '@/utils/trainingLoad';
import {Skeleton} from '@/components/ui/skeleton';
import {RQ, ContourBg, TopoLine, XAxis, scaleTo, smoothPath, type Pt} from './charts';

const RANGES = [
  {key: '6w', label: '6W', days: 42},
  {key: '3m', label: '3M', days: 90},
  {key: '1y', label: '1Y', days: 365},
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});

// Editorial topographic CTL/ATL/TSB chart drawn from real fitness data.
export function TopoFitnessChart({
  fitnessData,
  loading,
}: {
  fitnessData: FitnessDataPoint[] | undefined;
  loading: boolean;
}) {
  const [range, setRange] = useState<RangeKey>('3m');
  const days = RANGES.find((r) => r.key === range)!.days;

  const data = useMemo(() => fitnessData?.slice(-days) ?? [], [fitnessData, days]);

  // Chart geometry — design's broadsheet dims.
  const X = 60, Y = 24, W = 1240, H = 232;
  const VB_W = 1368, VB_H = 290;

  const geom = useMemo(() => {
    if (data.length < 2) return null;
    const ctlVals = data.map((d) => d.ctl);
    const atlVals = data.map((d) => d.atl);
    const tsbVals = data.map((d) => d.tsb);
    const all = [...ctlVals, ...atlVals, ...tsbVals];
    let yMin = Math.min(...all);
    let yMax = Math.max(...all);
    // pad + keep zero in view for the TSB baseline
    yMin = Math.min(yMin, 0) - 6;
    yMax = yMax + 8;
    const n = data.length - 1;
    const opts = {x0: X, y0: Y, w: W, h: H, xMin: 0, xMax: n, yMin, yMax};
    const toPts = (vals: number[]): Pt[] => vals.map((v, i) => [i, v]);
    const ctlS = scaleTo(toPts(ctlVals), opts);
    const atlS = scaleTo(toPts(atlVals), opts);
    const tsbS = scaleTo(toPts(tsbVals), opts);
    const zeroY = Y + H - ((0 - yMin) / (yMax - yMin)) * H;
    // y ticks
    const span = yMax - yMin;
    const step = span > 120 ? 40 : span > 60 ? 20 : 10;
    const ticks: number[] = [];
    for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) ticks.push(v);
    const yPos = (v: number) => Y + H - ((v - yMin) / (yMax - yMin)) * H;
    // x ticks — ~5 dates
    const xTicks = [0, 0.25, 0.5, 0.75, 1].map((p) => {
      const idx = Math.round(p * n);
      return {pos: p, label: p === 1 ? 'Today' : fmtDate(data[idx].date)};
    });
    return {
      ctlD: smoothPath(ctlS),
      atlD: smoothPath(atlS),
      tsbD: smoothPath(tsbS),
      zeroY,
      ticks,
      yPos,
      xTicks,
    };
  }, [data]);

  return (
    <div className="surface-slab h-full p-5 md:p-6 flex flex-col" style={{minHeight: 340}}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="h-section" style={{fontSize: 26}}>The Last 90 Days</span>
          <span className="deck" style={{fontSize: 14}}>
            Fitness, fatigue, form, plotted as a topographic ridge.
          </span>
        </div>
        <div className="flex" role="group" aria-label="Chart time range" style={{border: '1px solid var(--color-ink)'}}>
          {RANGES.map((r) => {
            const sel = range === r.key;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                aria-pressed={sel}
                className="label"
                style={{
                  padding: '5px 10px',
                  background: sel ? 'var(--color-ink)' : 'transparent',
                  color: sel ? 'var(--color-paper)' : 'var(--color-ink-3)',
                  borderLeft: r.key !== '6w' ? '1px solid var(--color-rule)' : 'none',
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        <span className="label" style={{display: 'inline-flex', alignItems: 'center', gap: 5}}>
          <svg width={18} height={6}><line x1={0} y1={3} x2={18} y2={3} stroke={RQ.ink} strokeWidth={1.6} /></svg>
          CTL · fitness
        </span>
        <span className="label" style={{display: 'inline-flex', alignItems: 'center', gap: 5}}>
          <svg width={18} height={6}><line x1={0} y1={3} x2={18} y2={3} stroke={RQ.ink} strokeWidth={1.1} strokeDasharray="4 3" /></svg>
          ATL · fatigue
        </span>
        <span className="label" style={{display: 'inline-flex', alignItems: 'center', gap: 5}}>
          <svg width={18} height={6}><line x1={0} y1={3} x2={18} y2={3} stroke={RQ.rust} strokeWidth={1.6} /></svg>
          TSB · form
        </span>
      </div>

      <div className="flex-1 mt-3 min-h-[220px]">
        {loading || !geom ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} style={{width: '100%', height: '100%', display: 'block'}} preserveAspectRatio="none">
            <ContourBg x={X} y={Y} w={W} h={H} lines={6} stroke={RQ.rule} opacity={0.5} />
            {/* zero baseline */}
            <line x1={X} y1={geom.zeroY} x2={X + W} y2={geom.zeroY} stroke={RQ.ink} strokeWidth={0.6} strokeDasharray="2 4" />
            {/* TSB fill to zero */}
            <path d={`${geom.tsbD} L ${X + W},${geom.zeroY} L ${X},${geom.zeroY} Z`} fill={RQ.rust} fillOpacity={0.08} />
            {/* series */}
            <TopoLine d={geom.ctlD} color={RQ.ink} width={1.8} contours={5} contourGap={5} />
            <path d={geom.atlD} stroke={RQ.ink} strokeWidth={1.1} strokeDasharray="4 3" fill="none" />
            <path d={geom.tsbD} stroke={RQ.rust} strokeWidth={1.6} fill="none" />
            {/* y-axis labels */}
            {geom.ticks.map((v) => (
              <text key={v} x={X - 8} y={geom.yPos(v) + 3} fontSize={9} fontFamily="var(--mono)" fill={RQ.ink3} textAnchor="end">
                {v > 0 ? '+' : ''}{Math.round(v)}
              </text>
            ))}
            {/* x-axis labels */}
            <XAxis x={X} y={Y + H + 8} w={W} ticks={geom.xTicks} />
            {/* today marker */}
            <line x1={X + W} y1={Y - 6} x2={X + W} y2={Y + H + 6} stroke={RQ.rust} strokeWidth={1} strokeDasharray="2 2" />
          </svg>
        )}
      </div>
    </div>
  );
}
