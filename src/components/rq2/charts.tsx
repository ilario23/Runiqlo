'use client';

/* RUNIQLO v3 — chart & visualization primitives (carbon instrument).
   Self-contained SVG, theme-token driven. Ported from the design handoff. */

import {useRef, useState, useLayoutEffect, useEffect} from 'react';

/* ── measure a container's pixel size ──────────────────────────────────────── */
export function useMeasure<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({w: 0, h: 0});
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({w: Math.round(r.width), h: Math.round(r.height)});
    });
    ro.observe(el);
    setSize({w: el.clientWidth, h: el.clientHeight});
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export interface FitnessPoint {
  date: Date | string;
  ctl: number;
  atl: number;
  tsb: number;
}
export interface ZoneDef {
  z: number;
  name: string;
  color: string;
  lo?: number;
  hi?: number;
}

const toDate = (d: Date | string): Date => (d instanceof Date ? d : new Date(d));
const fmtD = (d: Date | string) =>
  toDate(d).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});

/* ── Fitness PMC chart: CTL area + ATL line + TSB bars ─────────────────────── */
export function FitnessChart({series, days = 90, height = 220}: {series: FitnessPoint[]; days?: number; height?: number}) {
  const [ref, {w}] = useMeasure();
  const [hover, setHover] = useState<number | null>(null);
  const data = series.slice(-days);
  if (data.length < 2) {
    return <div ref={ref} style={{width: '100%', height, display: 'grid', placeItems: 'center'}}>
      <span className="lbl">Not enough data yet</span>
    </div>;
  }
  const padL = 30, padR = 30, padT = 14, padB = 22;
  const H = height;
  const innerW = Math.max(10, w - padL - padR);
  const innerH = H - padT - padB;

  const maxLoad = Math.max(...data.map((d) => Math.max(d.ctl, d.atl))) * 1.1 || 1;
  const tsbMax = Math.max(20, Math.max(...data.map((d) => Math.abs(d.tsb))) * 1.15);

  const x = (i: number) => padL + (i / (data.length - 1)) * innerW;
  const yLoad = (v: number) => padT + innerH - (v / maxLoad) * innerH;
  const tsbZeroY = padT + innerH * 0.5;
  const yTsb = (v: number) => tsbZeroY - (v / tsbMax) * (innerH * 0.42);

  const ctlPts = data.map((d, i) => `${x(i)},${yLoad(d.ctl)}`).join(' ');
  const ctlPath = `M${padL},${padT + innerH} L${ctlPts.split(' ').join(' L')} L${padL + innerW},${padT + innerH} Z`;
  const ctlLine = 'M' + data.map((d, i) => `${x(i)},${yLoad(d.ctl)}`).join(' L');
  const atlLine = 'M' + data.map((d, i) => `${x(i)},${yLoad(d.atl)}`).join(' L');

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!w) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let i = Math.round(((px - padL) / innerW) * (data.length - 1));
    i = Math.max(0, Math.min(data.length - 1, i));
    setHover(i);
  };

  const tsbCol = (v: number) => (v >= 8 ? 'var(--fresh)' : v <= -12 ? 'var(--fatigue)' : 'var(--neutral)');

  return (
    <div ref={ref} style={{width: '100%', height: H, position: 'relative'}}>
      {w > 0 && (
        <svg width={w} height={H} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{display: 'block'}}
          role="img" aria-label="Training load — fitness, fatigue and form over time">
          <defs>
            <linearGradient id="ctlGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.01" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((t, k) => (
            <line key={k} x1={padL} x2={padL + innerW} y1={padT + innerH * t} y2={padT + innerH * t} stroke="var(--line)" strokeWidth="1" />
          ))}
          <line x1={padL} x2={padL + innerW} y1={tsbZeroY} y2={tsbZeroY} stroke="var(--line-2)" strokeWidth="1" strokeDasharray="2 4" />
          {data.map((d, i) => {
            const yy = yTsb(d.tsb);
            return <rect key={i} x={x(i) - Math.max(0.7, innerW / data.length / 2.4)} width={Math.max(1.4, innerW / data.length / 1.2)}
              y={Math.min(yy, tsbZeroY)} height={Math.abs(yy - tsbZeroY)} fill={tsbCol(d.tsb)} opacity="0.5" />;
          })}
          <path d={ctlPath} fill="url(#ctlGrad)" />
          <path d={ctlLine} fill="none" stroke="var(--accent)" strokeWidth="2" />
          <path d={atlLine} fill="none" stroke="var(--z5)" strokeWidth="1.4" strokeDasharray="4 3" opacity="0.9" />
          {[0, 0.5, 1].map((t, k) => (
            <text key={k} x={padL - 6} y={padT + innerH * (1 - t) + 3} textAnchor="end" fontSize="9" fontFamily="var(--mono)" fill="var(--faint)">{Math.round(maxLoad * t)}</text>
          ))}
          {[0, Math.floor(data.length / 2), data.length - 1].map((i, k) => (
            <text key={k} x={x(i)} y={H - 6} textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'} fontSize="9" fontFamily="var(--mono)" fill="var(--faint)">{fmtD(data[i].date)}</text>
          ))}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke="var(--line-3)" strokeWidth="1" />
              <circle cx={x(hover)} cy={yLoad(data[hover].ctl)} r="3.5" fill="var(--accent)" stroke="var(--bg)" strokeWidth="1.5" />
              <circle cx={x(hover)} cy={yLoad(data[hover].atl)} r="3" fill="var(--z5)" stroke="var(--bg)" strokeWidth="1.5" />
            </g>
          )}
        </svg>
      )}
      {hover != null && (
        <div style={{position: 'absolute', top: 6, left: Math.min(Math.max(x(hover) - 70, 4), w - 150),
          background: 'var(--panel-3)', border: '1px solid var(--line-2)', borderRadius: 7, padding: '7px 10px',
          pointerEvents: 'none', fontFamily: 'var(--mono)', fontSize: 10.5, minWidth: 132, zIndex: 4}}>
          <div style={{color: 'var(--dim)', marginBottom: 4, letterSpacing: '.06em'}}>{fmtD(data[hover].date)}</div>
          <ChartRow k="FITNESS" v={Math.round(data[hover].ctl)} c="var(--accent)" />
          <ChartRow k="FATIGUE" v={Math.round(data[hover].atl)} c="var(--z5)" />
          <ChartRow k="FORM" v={(data[hover].tsb > 0 ? '+' : '') + Math.round(data[hover].tsb)} c={tsbCol(data[hover].tsb)} />
        </div>
      )}
    </div>
  );
}
function ChartRow({k, v, c}: {k: string; v: string | number; c: string}) {
  return (
    <div style={{display: 'flex', justifyContent: 'space-between', gap: 14}}>
      <span style={{color: 'var(--faint)'}}>{k}</span>
      <span style={{color: c, fontWeight: 600}}>{v}</span>
    </div>
  );
}

/* ── Form gauge (semicircle, segmented arc + marker) ───────────────────────── */
export function FormGauge({tsb, size = 180}: {tsb: number; size?: number}) {
  const W = size;
  const cx = W / 2, cy = size * 0.62 + size * 0.06, r = W * 0.42;
  const clamp = Math.max(-30, Math.min(30, tsb));
  const t = (clamp + 30) / 60;
  const ang = Math.PI - t * Math.PI;
  const nx = cx + Math.cos(ang) * r, ny = cy - Math.sin(ang) * r;
  const arc = (a0: number, a1: number, rr: number) => {
    const x0 = cx + Math.cos(a0) * rr, y0 = cy - Math.sin(a0) * rr;
    const x1 = cx + Math.cos(a1) * rr, y1 = cy - Math.sin(a1) * rr;
    const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
    return `M${x0},${y0} A${rr},${rr} 0 ${large} 1 ${x1},${y1}`;
  };
  const segAng = (v: number) => Math.PI - ((Math.max(-30, Math.min(30, v)) + 30) / 60) * Math.PI;
  const segs: [number, number, string][] = [
    [-30, -12, 'var(--fatigue)'],
    [-12, 8, 'var(--neutral)'],
    [8, 25, 'var(--fresh)'],
    [25, 30, 'var(--accent)'],
  ];
  return (
    <svg width={W} height={cy + 16} style={{display: 'block', overflow: 'visible'}} aria-hidden="true">
      <path d={arc(Math.PI, 0, r)} fill="none" stroke="var(--panel-3)" strokeWidth="9" strokeLinecap="round" />
      {segs.map((s, i) => (
        <path key={i} d={arc(segAng(s[0]), segAng(s[1]), r)} fill="none" stroke={s[2]} strokeWidth="9" strokeLinecap="round" opacity="0.95" />
      ))}
      <circle cx={nx} cy={ny} r="7" fill="var(--bg)" />
      <circle cx={nx} cy={ny} r="6" fill="var(--text)" />
    </svg>
  );
}

/* ── Form ring (Apple Fitness closed ring) ─────────────────────────────────── */
export function FormRing({tsb, size = 180, color = 'var(--accent)'}: {tsb: number; size?: number; color?: string}) {
  const r = size * 0.4;
  const cx = size / 2, cy = size / 2, sw = size * 0.085;
  const circ = 2 * Math.PI * r;
  const clamp = Math.max(-30, Math.min(30, tsb));
  const frac = (clamp + 30) / 60;
  const dash = circ * frac;
  return (
    <svg width={size} height={size} style={{display: 'block', transform: 'rotate(-90deg)'}} aria-hidden="true">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--panel-3)" strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} style={{transition: 'stroke-dasharray 1s cubic-bezier(.2,.7,.3,1)', filter: `drop-shadow(0 0 6px ${color}55)`}} />
    </svg>
  );
}

/* ── Zone distribution: horizontal stacked bar ─────────────────────────────── */
export function ZoneStack({zones, dist, height = 14, showPct = true}: {zones: ZoneDef[]; dist: number[]; height?: number; showPct?: boolean}) {
  return (
    <div style={{width: '100%'}}>
      <div style={{display: 'flex', height, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--line)'}}>
        {dist.map((f, i) => f > 0 && (
          <div key={i} title={`${zones[i].name} ${Math.round(f * 100)}%`} style={{width: `${f * 100}%`, background: zones[i].color, opacity: 0.85}} />
        ))}
      </div>
      {showPct && (
        <div style={{display: 'flex', marginTop: 7, gap: 10, flexWrap: 'wrap'}}>
          {dist.map((f, i) => (
            <div key={i} style={{display: 'flex', alignItems: 'center', gap: 5}}>
              <span style={{width: 8, height: 8, borderRadius: 2, background: zones[i].color}} />
              <span className="mono" style={{fontSize: 10, color: 'var(--dim)'}}>Z{zones[i].z}</span>
              <span className="mono" style={{fontSize: 10, color: 'var(--faint)'}}>{Math.round(f * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Vertical zone bars ────────────────────────────────────────────────────── */
export function ZoneBars({zones, dist, height = 90}: {zones: ZoneDef[]; dist: number[]; height?: number}) {
  const max = Math.max(...dist) || 1;
  return (
    <div style={{display: 'flex', alignItems: 'flex-end', gap: 6, height}}>
      {dist.map((f, i) => (
        <div key={i} style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, height: '100%', justifyContent: 'flex-end'}}>
          <span className="mono" style={{fontSize: 9.5, color: 'var(--dim)'}}>{Math.round(f * 100)}</span>
          <div style={{width: '100%', height: `${(f / max) * 70}%`, minHeight: 2, background: zones[i].color, borderRadius: '3px 3px 0 0', opacity: 0.85}} />
          <span className="mono" style={{fontSize: 9, color: 'var(--faint)'}}>Z{zones[i].z}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Route trace (stylized polyline in a 0..100 box) ───────────────────────── */
export function RouteTrace({d, height = 160, animate = true, accent = 'var(--accent)', showNodes = true}:
  {d: string; height?: number; animate?: boolean; accent?: string; showNodes?: boolean}) {
  const [ref, {w}] = useMeasure();
  const pathRef = useRef<SVGPathElement>(null);
  useEffect(() => {
    if (animate && pathRef.current) {
      const len = pathRef.current.getTotalLength();
      const el = pathRef.current;
      el.style.transition = 'none';
      el.style.strokeDasharray = String(len);
      el.style.strokeDashoffset = String(len);
      requestAnimationFrame(() => {
        el.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(.2,.7,.3,1)';
        el.style.strokeDashoffset = '0';
      });
    }
  }, [d, animate]);
  const nums = (d.match(/-?\d+\.?\d*/g) || []).map(Number);
  const start = [nums[0] ?? 0, nums[1] ?? 0];
  const end = [nums[nums.length - 2] ?? 0, nums[nums.length - 1] ?? 0];
  return (
    <div ref={ref} className="gridbg" style={{width: '100%', height, borderRadius: 7, overflow: 'hidden', position: 'relative', background: 'var(--bg-2)'}}>
      {w > 0 && (
        <svg width={w} height={height} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={{display: 'block'}} role="img" aria-label="Route map">
          <path d={d} fill="none" stroke="var(--bg)" strokeWidth="3.4" strokeLinejoin="round" strokeLinecap="round" opacity="0.6" />
          <path ref={pathRef} d={d} fill="none" stroke={accent} strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
          {showNodes && <>
            <circle cx={start[0]} cy={start[1]} r="2.2" fill="var(--bg)" stroke={accent} strokeWidth="1.4" />
            <circle cx={end[0]} cy={end[1]} r="2.4" fill={accent} />
          </>}
        </svg>
      )}
    </div>
  );
}

/* ── HR stream chart with zone bands ───────────────────────────────────────── */
export function StreamChart({stream, zones, height = 180, color = 'var(--accent)', fill = true, yMin, yMax, bands = true}:
  {stream: number[]; zones?: ZoneDef[] | null; height?: number; color?: string; fill?: boolean; yMin?: number; yMax?: number; bands?: boolean}) {
  const [ref, {w}] = useMeasure();
  const [hover, setHover] = useState<number | null>(null);
  if (!stream || stream.length < 2) return <div ref={ref} style={{width: '100%', height}} />;
  const padT = 8, padB = 8, padL = 4, padR = 4;
  const H = height, innerH = H - padT - padB;
  const lo = yMin != null ? yMin : Math.min(...stream) * 0.96;
  const hi = yMax != null ? yMax : Math.max(...stream) * 1.04;
  const innerW = Math.max(10, w - padL - padR);
  const x = (i: number) => padL + (i / (stream.length - 1)) * innerW;
  const y = (v: number) => padT + innerH - ((v - lo) / (hi - lo)) * innerH;
  const line = 'M' + stream.map((v, i) => `${x(i)},${y(v)}`).join(' L');
  const area = `M${padL},${padT + innerH} L` + stream.map((v, i) => `${x(i)},${y(v)}`).join(' L') + ` L${padL + innerW},${padT + innerH} Z`;
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left - padL) / innerW) * (stream.length - 1));
    setHover(Math.max(0, Math.min(stream.length - 1, i)));
  };
  return (
    <div ref={ref} style={{width: '100%', height: H, position: 'relative'}}>
      {w > 0 && (
        <svg width={w} height={H} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{display: 'block'}} role="img" aria-label="Stream chart">
          <defs>
            <linearGradient id="streamGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0.01" />
            </linearGradient>
          </defs>
          {bands && zones && zones.map((z, i) => {
            if (z.lo == null || z.hi == null) return null;
            if (z.lo > hi || z.hi < lo) return null;
            const zy0 = y(Math.min(hi, z.hi)), zy1 = y(Math.max(lo, z.lo));
            return <rect key={i} x={padL} width={innerW} y={zy0} height={Math.max(0, zy1 - zy0)} fill={z.color} opacity="0.07" />;
          })}
          {fill && <path d={area} fill="url(#streamGrad)" />}
          <path d={line} fill="none" stroke={color} strokeWidth="1.5" />
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke="var(--line-3)" strokeWidth="1" />
              <circle cx={x(hover)} cy={y(stream[hover])} r="3" fill={color} stroke="var(--bg)" strokeWidth="1.5" />
            </g>
          )}
        </svg>
      )}
      {hover != null && (
        <div style={{position: 'absolute', top: 2, left: Math.min(Math.max(x(hover) - 30, 2), w - 70),
          background: 'var(--panel-3)', border: '1px solid var(--line-2)', borderRadius: 5, padding: '3px 7px',
          fontFamily: 'var(--mono)', fontSize: 10.5, color, fontWeight: 600, pointerEvents: 'none'}}>
          {stream[hover]}
        </div>
      )}
    </div>
  );
}

/* ── Sparkline ─────────────────────────────────────────────────────────────── */
export function Sparkline({data, width = 90, height = 26, color = 'var(--accent)', invert = false}:
  {data: number[]; width?: number; height?: number; color?: string; invert?: boolean}) {
  const lo = Math.min(...data), hi = Math.max(...data);
  const x = (i: number) => (i / (data.length - 1)) * width;
  const y = (v: number) => {
    const t = (v - lo) / (hi - lo || 1);
    return height - (invert ? 1 - t : t) * (height - 4) - 2;
  };
  const line = 'M' + data.map((v, i) => `${x(i)},${y(v)}`).join(' L');
  return (
    <svg width={width} height={height} style={{display: 'block'}} aria-hidden="true">
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r="2" fill={color} />
    </svg>
  );
}

/* ── Volume bars (macro plan weekly volume) ────────────────────────────────── */
export function VolumeBars({data, current, height = 90}: {data: number[]; current: number; height?: number}) {
  const [ref, {w}] = useMeasure();
  const max = Math.max(...data) * 1.1 || 1;
  const gap = 3;
  const bw = w > 0 ? (w - gap * (data.length - 1)) / data.length : 0;
  return (
    <div ref={ref} style={{width: '100%', height, position: 'relative'}}>
      {w > 0 && (
        <svg width={w} height={height} style={{display: 'block'}} role="img" aria-label="Weekly volume">
          {data.map((v, i) => {
            const h = (v / max) * (height - 16);
            const isCur = i + 1 === current;
            const done = i + 1 < current;
            return (
              <g key={i}>
                <rect x={i * (bw + gap)} y={height - 14 - h} width={bw} height={h} rx="2"
                  fill={isCur ? 'var(--accent)' : done ? 'var(--line-3)' : 'var(--panel-3)'}
                  stroke={isCur ? 'var(--accent)' : 'var(--line-2)'} strokeWidth="1" />
                <text x={i * (bw + gap) + bw / 2} y={height - 3} textAnchor="middle" fontSize="8" fontFamily="var(--mono)" fill={isCur ? 'var(--accent)' : 'var(--faint)'}>{i + 1}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
