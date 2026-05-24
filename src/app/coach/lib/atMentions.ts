import type {WeeklyPlan, PlannedDay, TrainingPlan} from '@/lib/coachTypes';

export interface MentionDef {
  prefix: string;
  description: string;
  example: string;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function getMonday(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

export const MENTION_DEFS: MentionDef[] = [
  {prefix: 'week', description: 'A specific training week', example: '@week:2025-06-09'},
  {prefix: 'today', description: "Today's planned workout", example: '@today'},
  {prefix: 'plan', description: 'Current macro training plan', example: '@plan'},
  {prefix: 'fitness', description: 'Current CTL/ATL/TSB snapshot', example: '@fitness'},
];

async function resolveWeekMention(dateArg: string, athleteId: number): Promise<string> {
  const weekStart = getMonday(dateArg || undefined);
  const res = await fetch(`/api/coach/week?athleteId=${athleteId}&weekStart=${weekStart}`);
  if (!res.ok) return `[week:${weekStart} — no plan generated yet]`;
  const week: WeeklyPlan = await res.json();
  if (!week) return `[week:${weekStart} — no plan generated yet]`;
  const t = today();
  const lines = (week.days as PlannedDay[]).map(d => {
    const marker = d.date < t ? '✓ ' : d.date === t ? '→ ' : '';
    if (!d.workouts.length) return `${marker}${DAY_NAMES[d.dayOfWeek]}: Rest`;
    const ws = d.workouts.map(w => {
      let s = w.type.replace(/_/g, ' ');
      if (w.distanceKm) s += ` ${w.distanceKm}km`;
      else if (w.durationMinutes) s += ` ${w.durationMinutes}min`;
      return s;
    });
    return `${marker}${DAY_NAMES[d.dayOfWeek]}: ${ws.join(' + ')}`;
  });
  return `[week:${weekStart} (${week.phase}, wk${week.weekNumber}):\n${lines.join(' | ')}]`;
}

async function resolveTodayMention(athleteId: number): Promise<string> {
  const t = today();
  const weekStart = getMonday(t);
  const res = await fetch(`/api/coach/week?athleteId=${athleteId}&weekStart=${weekStart}`);
  if (!res.ok) return `[today:${t} — no weekly plan]`;
  const week: WeeklyPlan = await res.json();
  if (!week) return `[today:${t} — no weekly plan]`;
  const day = (week.days as PlannedDay[]).find(d => d.date === t);
  if (!day || !day.workouts.length) return `[today:${t} — rest day]`;
  const ws = day.workouts.map(w => {
    let s = w.type.replace(/_/g, ' ');
    if (w.distanceKm) s += ` ${w.distanceKm}km`;
    else if (w.durationMinutes) s += ` ${w.durationMinutes}min`;
    if (w.completed) s += ' ✓';
    return s;
  });
  return `[today:${t} — ${ws.join(' + ')}]`;
}

async function resolvePlanMention(athleteId: number): Promise<string> {
  const res = await fetch(`/api/coach/plan?athleteId=${athleteId}`);
  if (!res.ok) return '[plan — not found]';
  const plan: TrainingPlan = await res.json();
  if (!plan) return '[plan — no active plan]';
  const phases = plan.phases.map(p => `${p.phase}(${p.weekCount}wk)`).join(' → ');
  const cur = plan.phases[plan.currentPhaseIndex];
  return `[plan: ${plan.goalType} | ${phases} | current: ${cur?.phase ?? '?'} — "${cur?.focusDescription ?? ''}"]`;
}

async function resolveFitnessMention(athleteId: number): Promise<string> {
  const res = await fetch(`/api/coach/fitness?athleteId=${athleteId}`);
  if (!res.ok) return '[fitness — unavailable]';
  const data = await res.json();
  if (!data) return '[fitness — no data]';
  return `[fitness: CTL ${data.ctl} | ATL ${data.atl} | TSB ${data.tsb} | ACWR ${data.acwr} | Risk: ${data.riskLevel}]`;
}

// Pattern: @prefix or @prefix:arg
const MENTION_RE = /@(week|today|plan|fitness)(?::([^\s@]+))?/g;

export async function resolveAtMentions(text: string, athleteId: number): Promise<string> {
  const matches = [...text.matchAll(MENTION_RE)];
  if (matches.length === 0) return text;

  const resolutions = await Promise.all(
    matches.map(async m => {
      const [full, prefix, arg] = m;
      let resolved: string;
      switch (prefix) {
        case 'week': resolved = await resolveWeekMention(arg ?? '', athleteId); break;
        case 'today': resolved = await resolveTodayMention(athleteId); break;
        case 'plan': resolved = await resolvePlanMention(athleteId); break;
        case 'fitness': resolved = await resolveFitnessMention(athleteId); break;
        default: resolved = full;
      }
      return {full, resolved};
    }),
  );

  let result = text;
  // Replace in reverse order to preserve positions
  for (const {full, resolved} of resolutions.reverse()) {
    result = result.replace(full, resolved);
  }
  return result;
}
