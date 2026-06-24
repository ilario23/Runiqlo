'use client';

/* RUNIQLO v3 — shared UI primitives (carbon instrument).
   Ported from the design handoff; wired to the app's real zone model. */

import type {CSSProperties, ReactNode} from 'react';
import {ZONE_COLORS, ZONE_NAMES} from '@/lib/activityModel';
import type {UserSettings} from '@/lib/activityModel';
import type {ZoneDef} from './charts';

/* ── formatting helpers ────────────────────────────────────────────────────── */
export const fmtDate = (d: Date, opts?: Intl.DateTimeFormatOptions) =>
  d.toLocaleDateString('en-US', opts || {month: 'short', day: 'numeric'});
export const fmtWeekday = (d: Date) => d.toLocaleDateString('en-US', {weekday: 'short'}).toUpperCase();
export const signed = (n: number) => (n > 0 ? '+' : '') + n;

export function relTime(d: Date, now: Date = new Date()): string {
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const h = Math.round(mins / 60);
  if (h < 24) return h + 'h ago';
  const days = Math.round(h / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return days + 'd ago';
  return fmtDate(d);
}

/* form / TSB descriptor */
export function formState(tsb: number): {label: string; color: string; note: string} {
  if (tsb >= 25) return {label: 'PEAKED', color: 'var(--accent)', note: 'Race-ready freshness'};
  if (tsb >= 8) return {label: 'FRESH', color: 'var(--fresh)', note: 'Primed for quality'};
  if (tsb > -12) return {label: 'NEUTRAL', color: 'var(--neutral)', note: 'Productive training zone'};
  if (tsb > -25) return {label: 'FATIGUED', color: 'var(--fatigue)', note: 'Carrying load — ease back'};
  return {label: 'STRAINED', color: 'var(--fatigue)', note: 'High risk — recover'};
}

/* workout-type config (maps to HR-zone colours) */
export const WORKOUT: Record<string, {color: string; label: string}> = {
  long:      {color: 'var(--z2)', label: 'LONG'},
  threshold: {color: 'var(--z4)', label: 'THRESHOLD'},
  interval:  {color: 'var(--z5)', label: 'INTERVAL'},
  tempo:     {color: 'var(--z3)', label: 'TEMPO'},
  easy:      {color: 'var(--z1)', label: 'EASY'},
  recovery:  {color: 'var(--z1)', label: 'RECOVERY'},
  race:      {color: 'var(--accent)', label: 'RACE'},
  rest:      {color: 'var(--faint)', label: 'REST'},
};
export const workoutCfg = (type?: string) => WORKOUT[(type || '').toLowerCase()] || WORKOUT.easy;

export const ZONEKEY: Record<number, string> = {
  0: 'var(--faint)', 1: 'var(--z1)', 2: 'var(--z2)', 3: 'var(--z3)', 4: 'var(--z4)', 5: 'var(--z5)', 6: 'var(--z6)',
};

export type AdherenceState = 'match' | 'partial' | 'extra' | 'missed';
export const ADHERENCE: Record<AdherenceState, {color: string; label: string; dot: string}> = {
  match:   {color: 'var(--fresh)', label: 'ON PLAN', dot: '●'},
  partial: {color: 'var(--neutral)', label: 'PARTIAL', dot: '◐'},
  extra:   {color: 'var(--z2)', label: 'UNPLANNED', dot: '+'},
  missed:  {color: 'var(--fatigue)', label: 'MISSED', dot: '○'},
};

/* Build ZoneDef[] from the athlete's HR-zone settings. */
export function buildZones(zones: UserSettings['zones']): ZoneDef[] {
  return ([1, 2, 3, 4, 5, 6] as const).map((z) => {
    const [lo, hi] = zones[`z${z}` as keyof UserSettings['zones']];
    return {z, name: ZONE_NAMES[z].toUpperCase(), color: ZONE_COLORS[z], lo, hi};
  });
}

/* ── Icons (thin line) ─────────────────────────────────────────────────────── */
const ICON_PATHS: Record<string, string> = {
  dash: 'M3 12.5h6l2-7 3 14 2-7h6',
  activity: 'M4 6h16M4 12h16M4 18h10',
  route: 'M6 19a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM7 17c6 0 4-10 10-10',
  coach: 'M5 5h14v10H9l-4 4z',
  segment: 'M4 17l5-5 4 3 7-8',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20a7.5 7.5 0 0115 0',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z M9 4v14 M15 6v14',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 017-2 4 4 0 017 2c0 5.5-7 10-7 10z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  chevron: 'M9 6l6 6-6 6',
  target: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8zM12 12h.01',
  send: 'M4 12l16-7-7 16-2-7-7-2z',
  check: 'M5 12l4 4 10-11',
  wind: 'M3 8h11a2.5 2.5 0 10-2.5-2.5M3 16h15a2.5 2.5 0 11-2.5 2.5M3 12h9',
  plus: 'M12 5v14M5 12h14',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
};

export function Icon({name, size = 18, stroke = 1.6, style}: {name: string; size?: number; stroke?: number; style?: CSSProperties}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{display: 'block', flexShrink: 0, ...style}} aria-hidden="true">
      <path d={ICON_PATHS[name] || ICON_PATHS.activity} />
    </svg>
  );
}

/* ── Tile (panel w/ header) ────────────────────────────────────────────────── */
export function Tile({title, right, children, pad = true, style, className = '', bodyStyle}:
  {title?: ReactNode; right?: ReactNode; children: ReactNode; pad?: boolean; style?: CSSProperties; className?: string; bodyStyle?: CSSProperties}) {
  return (
    <section className={'panel ' + className} style={style}>
      {title && (
        <div className="panel-hd">
          <span className="lbl">{title}</span>
          {right}
        </div>
      )}
      <div style={{padding: pad ? 'var(--pad)' : 0, ...bodyStyle}}>{children}</div>
    </section>
  );
}

/* ── Readout (big metric) ──────────────────────────────────────────────────── */
export function Readout({value, unit, label, color = 'var(--text)', sub, size = 'var(--fs-hero)', trend}:
  {value: ReactNode; unit?: string; label?: ReactNode; color?: string; sub?: ReactNode; size?: string; trend?: number | null}) {
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 3}}>
      {label && <span className="lbl">{label}</span>}
      <div style={{display: 'flex', alignItems: 'baseline', gap: 5}}>
        <span className="num" style={{fontSize: size, fontWeight: 600, color, lineHeight: 1, letterSpacing: '-0.03em'}}>{value}</span>
        {unit && <span className="mono" style={{fontSize: 'var(--fs-sm)', color: 'var(--faint)'}}>{unit}</span>}
        {trend != null && (
          <span className="mono" style={{fontSize: 11, color: trend >= 0 ? 'var(--fresh)' : 'var(--fatigue)', marginLeft: 2}}>
            {trend >= 0 ? '▲' : '▼'}{Math.abs(trend)}
          </span>
        )}
      </div>
      {sub && <span style={{fontSize: 11.5, color: 'var(--dim)'}}>{sub}</span>}
    </div>
  );
}

/* ── Tag / badge ───────────────────────────────────────────────────────────── */
export function Tag({children, color, style, filled}: {children: ReactNode; color?: string; style?: CSSProperties; filled?: boolean}) {
  return (
    <span className="tag" style={{
      color: filled ? 'var(--accent-ink)' : (color || 'var(--dim)'),
      background: filled ? color : 'transparent',
      borderColor: color ? (filled ? color : `color-mix(in srgb, ${color} 45%, transparent)`) : 'var(--line-2)',
      ...style,
    }}>
      {children}
    </span>
  );
}

export function AdherenceBadge({a}: {a: AdherenceState}) {
  const cfg = ADHERENCE[a] || ADHERENCE.match;
  return (
    <span className="tag" style={{color: cfg.color, borderColor: `color-mix(in srgb, ${cfg.color} 40%, transparent)`}}>
      <span style={{fontSize: 9}}>{cfg.dot}</span>{cfg.label}
    </span>
  );
}

export function WorkoutDot({type, size = 8}: {type?: string; size?: number}) {
  const c = workoutCfg(type).color;
  return <span style={{width: size, height: size, borderRadius: '50%', background: c, flexShrink: 0, display: 'inline-block'}} />;
}

/* ── Mini metric ───────────────────────────────────────────────────────────── */
export function Mini({v, u}: {v: ReactNode; u: string}) {
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end'}}>
      <span className="num" style={{fontSize: 14, fontWeight: 600}}>{v}</span>
      <span className="lbl" style={{fontSize: 8.5}}>{u}</span>
    </div>
  );
}
