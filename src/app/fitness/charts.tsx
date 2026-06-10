'use client';

import {useState, useEffect} from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {Skeleton} from '@/components/ui/skeleton';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {COLORS} from '@/lib/activityModel';

// Decoupling thresholds map to the zone color vocabulary (One Signal Rule):
// well-coupled = green, mild drift = yellow, decoupled = red.
function decouplingColor(pct: number): string {
  return pct < 5 ? COLORS.green : pct < 8 ? COLORS.yellow : COLORS.red;
}

// ─── Aerobic Decoupling ────────────────────────────────────────────────────────

type DecouplingPoint = {
  activityId: number;
  date: string;
  name: string;
  durationMins: number;
  decouplingPct: number;
};

function DecouplingTooltip({active, payload}: {active?: boolean; payload?: Array<{payload?: DecouplingPoint}>}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;
  const color = decouplingColor(pt.decouplingPct);
  return (
    <div className="surface-card px-3 py-2 space-y-0.5 min-w-[160px]">
      <p className="label">{new Date(pt.date).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}</p>
      <p className="kicker-cell" style={{fontSize: 13}}>{pt.name}</p>
      <p className="num" style={{fontSize: 13, color}}>{pt.decouplingPct > 0 ? '+' : ''}{pt.decouplingPct}% decoupling</p>
      <p className="num" style={{fontSize: 11, color: 'var(--color-ink-3)'}}>{pt.durationMins} min</p>
    </div>
  );
}

export function DecouplingCard({breakdownsReady}: {breakdownsReady: boolean}) {
  const {athlete} = useStravaAuth();
  const defaultTo = new Date().toISOString().slice(0, 10);
  const defaultFrom = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 84);
    return d.toISOString().slice(0, 10);
  })();

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [points, setPoints] = useState<DecouplingPoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!athlete?.id) return;
    setLoading(true);
    setError(false);
    fetch(`/api/decoupling?athleteId=${athlete.id}&from=${from}&to=${to}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: DecouplingPoint[]) => setPoints(data))
      .catch(() => { setError(true); setPoints(null); })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athlete?.id, from, to, breakdownsReady, retry]);

  const chartData = (points ?? []).map((p) => ({
    ...p,
    dateMs: new Date(p.date).getTime(),
    dotColor: decouplingColor(p.decouplingPct),
  }));

  const dateField = {
    background: 'var(--color-paper)',
    border: '1px solid var(--color-ink)',
    color: 'var(--color-ink)',
  } as const;

  return (
    <div className="surface-card p-5 flex flex-col h-full">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <span className="h-section" style={{fontSize: 20}}>Aerobic decoupling</span>
          <p className="label" style={{marginTop: 4}}>Long runs ≥ 45 min · Pa:Hr drift</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2" style={{background: COLORS.green}} />
            <span className="label">{'<5% coupled'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2" style={{background: COLORS.yellow}} />
            <span className="label">{'5–8%'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2" style={{background: COLORS.red}} />
            <span className="label">{'>8% drift'}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <label className="label flex items-center gap-1.5">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="num px-2 py-1"
            style={{...dateField, fontSize: 11}}
          />
        </label>
        <label className="label flex items-center gap-1.5">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="num px-2 py-1"
            style={{...dateField, fontSize: 11}}
          />
        </label>
      </div>

      {loading ? (
        <Skeleton className="h-[200px] w-full" />
      ) : error ? (
        <div className="h-[200px] flex flex-col items-center justify-center gap-2.5 text-center">
          <p className="body-serif" style={{fontStyle: 'italic'}}>Couldn&apos;t load decoupling data.</p>
          <button onClick={() => setRetry((c) => c + 1)} className="btn">Try again</button>
        </div>
      ) : !points || points.length === 0 ? (
        <div className="h-[200px] flex items-center justify-center">
          <p className="body-serif" style={{fontStyle: 'italic'}}>No long runs with HR data in this range.</p>
        </div>
      ) : (
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{top: 4, right: 8, left: -20, bottom: 0}}>
              <XAxis
                dataKey="dateMs"
                type="number"
                domain={['dataMin', 'dataMax']}
                scale="time"
                tickFormatter={(v) => new Date(v as number).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}
                tick={{fill: 'var(--color-ink-3)', fontSize: 9}}
                axisLine={false}
                tickLine={false}
                tickCount={5}
              />
              <YAxis
                dataKey="decouplingPct"
                type="number"
                tick={{fill: 'var(--color-ink-3)', fontSize: 9}}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v as number}%`}
                domain={['auto', 'auto']}
              />
              <ReferenceLine y={5} stroke="rgba(26,24,20,0.12)" strokeDasharray="3 3" />
              <ReferenceLine y={8} stroke="rgba(26,24,20,0.08)" strokeDasharray="3 3" />
              <RechartsTooltip content={<DecouplingTooltip />} cursor={{strokeDasharray: '3 3', stroke: 'var(--color-rule)'}} />
              <Scatter
                data={chartData}
                shape={(props: {cx?: number; cy?: number; payload?: {dotColor: string}}) => {
                  const {cx = 0, cy = 0, payload} = props;
                  return <circle cx={cx} cy={cy} r={4.5} fill={payload?.dotColor ?? COLORS.green} stroke="var(--color-paper)" strokeWidth={0.75} />;
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
