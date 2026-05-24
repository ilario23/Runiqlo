import type {WeeklyPlan, PlannedDay} from '@/lib/coachTypes';

export interface CommandDef {
  name: string;
  argsHint: string;
  description: string;
  resolve: (args: string, athleteId: number) => Promise<string>;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatWeekForCoach(week: WeeklyPlan, today: string): string {
  const lines: string[] = [];
  for (const day of week.days as PlannedDay[]) {
    const isPast = day.date < today;
    const isToday = day.date === today;
    const marker = isPast ? '[done] ' : isToday ? '[TODAY] ' : '';
    if (!day.workouts.length) {
      lines.push(`${marker}${DAY_NAMES[day.dayOfWeek]} ${day.date}: Rest`);
      continue;
    }
    const ws = day.workouts.map(w => {
      let s = w.type.replace(/_/g, ' ');
      if (w.distanceKm) s += ` ${w.distanceKm}km`;
      else if (w.durationMinutes) s += ` ${w.durationMinutes}min`;
      if (w.completed) s += ' ✓';
      return s;
    });
    lines.push(`${marker}${DAY_NAMES[day.dayOfWeek]} ${day.date}: ${ws.join(' + ')}`);
  }
  return lines.join('\n');
}

async function fetchWeek(weekStart: string, athleteId: number): Promise<WeeklyPlan | null> {
  const res = await fetch(`/api/coach/week?athleteId=${athleteId}&weekStart=${weekStart}`);
  if (!res.ok) return null;
  return res.json();
}

function getMonday(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr + 'T12:00:00') : new Date();
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const COMMANDS: CommandDef[] = [
  {
    name: 'modify',
    argsHint: '[YYYY-MM-DD]',
    description: 'Modify a specific training week',
    resolve: async (args, athleteId) => {
      const weekStart = getMonday(args.trim() || undefined);
      const week = await fetchWeek(weekStart, athleteId);
      const t = today();
      if (!week) {
        return `I want to modify the week starting ${weekStart}. No plan has been generated for that week yet — please generate it first.`;
      }
      const formatted = formatWeekForCoach(week, t);
      const doneDays = (week.days as PlannedDay[]).filter(d => d.date < t && d.workouts.some(w => w.completed));
      const doneNote = doneDays.length > 0
        ? `\nAlready completed (do NOT change these): ${doneDays.map(d => DAY_NAMES[d.dayOfWeek]).join(', ')}`
        : '';
      return `I want to modify the week starting ${weekStart}. Today is ${t}.${doneNote}\n\nCurrent plan:\n${formatted}\n\nPlease help me with the following change:`;
    },
  },
  {
    name: 'skip',
    argsHint: '[YYYY-MM-DD]',
    description: 'Replace a day with rest',
    resolve: async (args, athleteId) => {
      const date = args.trim() || today();
      const weekStart = getMonday(date);
      const week = await fetchWeek(weekStart, athleteId);
      const t = today();
      if (!week) {
        return `Please replace ${date} with a rest day.`;
      }
      const d = date;
      const dayPlan = (week.days as PlannedDay[]).find(day => day.date === d);
      if (!dayPlan) return `Please replace ${date} with a rest day.`;
      if (d < t) return `${date} is already in the past — I cannot skip a completed day.`;
      const ws = dayPlan.workouts.map(w => w.type.replace(/_/g, ' ')).join(', ');
      return `Please replace ${date} (${DAY_NAMES[dayPlan.dayOfWeek]}) with a rest day. Currently scheduled: ${ws || 'rest'}. Save the updated week.`;
    },
  },
  {
    name: 'swap',
    argsHint: '[YYYY-MM-DD]',
    description: 'Swap the workout on a specific day',
    resolve: async (args, athleteId) => {
      const date = args.trim() || today();
      const weekStart = getMonday(date);
      const week = await fetchWeek(weekStart, athleteId);
      const t = today();
      if (!week) {
        return `Please suggest a replacement workout for ${date}.`;
      }
      const dayPlan = (week.days as PlannedDay[]).find(day => day.date === date);
      if (!dayPlan) return `Please suggest a replacement workout for ${date}.`;
      if (date < t) return `${date} is already in the past.`;
      const ws = dayPlan.workouts.map(w => {
        let s = w.type.replace(/_/g, ' ');
        if (w.distanceKm) s += ` ${w.distanceKm}km`;
        else if (w.durationMinutes) s += ` ${w.durationMinutes}min`;
        return s;
      }).join(', ');
      return `Please suggest a replacement for the workout on ${date} (${DAY_NAMES[dayPlan.dayOfWeek]}). Currently: ${ws || 'rest'}. What should I swap it with?`;
    },
  },
  {
    name: 'week',
    argsHint: '[YYYY-MM-DD]',
    description: 'Show or generate the plan for a week',
    resolve: async (args, athleteId) => {
      const weekStart = getMonday(args.trim() || undefined);
      const week = await fetchWeek(weekStart, athleteId);
      const t = today();
      if (!week) {
        return `Please generate the training plan for the week starting ${weekStart}. Call getRecentActivities and getFitnessSummary first, then ask how many days I have available, and save with saveWeeklyPlan.`;
      }
      const formatted = formatWeekForCoach(week, t);
      return `Here is the current plan for the week starting ${weekStart}:\n\n${formatted}\n\nWhat would you like to know or change about this week?`;
    },
  },
  {
    name: 'status',
    argsHint: '',
    description: 'Summarise current fitness and plan status',
    resolve: async (_args, _athleteId) => {
      return `Please give me a brief status summary: current fitness (CTL/ATL/TSB), where I am in my training plan, what this week looks like, and any risks or things to watch. Call getFitnessSummary to get fresh data.`;
    },
  },
];

export function findCommand(input: string): {command: CommandDef; args: string} | null {
  if (!input.startsWith('/')) return null;
  const spaceIdx = input.indexOf(' ');
  const name = (spaceIdx === -1 ? input.slice(1) : input.slice(1, spaceIdx)).toLowerCase();
  const args = spaceIdx === -1 ? '' : input.slice(spaceIdx + 1);
  const command = COMMANDS.find(c => c.name === name);
  if (!command) return null;
  return {command, args};
}
