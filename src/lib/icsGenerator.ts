import type {WeeklyPlan, WorkoutType} from '@/lib/coachTypes';

export interface IcsOptions {
  athleteId: number;
  plans: WeeklyPlan[];
  calendarName?: string;
}

const TYPE_LABELS: Record<WorkoutType, string> = {
  easy_run: 'Easy Run',
  long_run: 'Long Run',
  tempo_run: 'Tempo Run',
  interval_run: 'Intervals',
  recovery_run: 'Recovery Run',
  gym: 'Gym',
  cycling: 'Cycling',
  yoga: 'Yoga',
  cross_training: 'Cross Training',
  rest: 'Rest',
  swim: 'Swim',
  walk: 'Walk',
  hike: 'Hike',
};

const CATEGORIES: Record<WorkoutType, string> = {
  easy_run: 'Running',
  long_run: 'Running',
  tempo_run: 'Running',
  interval_run: 'Running',
  recovery_run: 'Running',
  gym: 'Fitness',
  cycling: 'Cycling',
  yoga: 'Yoga',
  cross_training: 'Cross Training',
  rest: 'Rest',
  swim: 'Swimming',
  walk: 'Walking',
  hike: 'Hiking',
};

function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function foldLine(line: string): string {
  const bytes = [...line];
  if (bytes.length <= 75) return line + '\r\n';
  let out = '';
  let i = 0;
  let first = true;
  while (i < bytes.length) {
    const limit = first ? 75 : 74;
    out += bytes.slice(i, i + limit).join('') + '\r\n';
    i += limit;
    if (i < bytes.length) out += ' ';
    first = false;
  }
  return out;
}

function toIcsDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function nowUtc(): string {
  return new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
}

export function generateIcs({athleteId, plans, calendarName}: IcsOptions): string {
  const dtstamp = nowUtc();
  const name = calendarName ?? 'Training Plan';
  let out = '';

  out += foldLine('BEGIN:VCALENDAR');
  out += foldLine('VERSION:2.0');
  out += foldLine('PRODID:-//RunCoach//Training Plan//EN');
  out += foldLine('CALSCALE:GREGORIAN');
  out += foldLine('METHOD:PUBLISH');
  out += foldLine(`X-WR-CALNAME:${escapeText(name)}`);
  out += foldLine('X-WR-CALDESC:Training plan exported from RunCoach');

  for (const plan of plans) {
    for (const day of plan.days) {
      day.workouts.forEach((workout, wi) => {
        if (workout.type === 'rest') return;

        const label = TYPE_LABELS[workout.type] ?? workout.type;
        let metric = '';
        if (workout.distanceKm != null) {
          metric = ` · ${workout.distanceKm}km`;
        } else if (workout.durationMinutes != null) {
          metric = ` · ${workout.durationMinutes}min`;
        }

        const descParts = [workout.intensityDescription, workout.specificInstructions]
          .filter(Boolean)
          .join('\n');

        out += foldLine('BEGIN:VEVENT');
        out += foldLine(`UID:${athleteId}-${day.date}-${wi}@runcoach`);
        out += foldLine(`DTSTAMP:${dtstamp}`);
        out += foldLine(`DTSTART;VALUE=DATE:${toIcsDate(day.date)}`);
        out += foldLine(`DTEND;VALUE=DATE:${nextDay(day.date)}`);
        out += foldLine(`SUMMARY:${escapeText(label + metric)}`);
        if (descParts) out += foldLine(`DESCRIPTION:${escapeText(descParts)}`);
        out += foldLine(`CATEGORIES:${CATEGORIES[workout.type]}`);
        out += foldLine('STATUS:CONFIRMED');
        out += foldLine('END:VEVENT');
      });
    }
  }

  out += foldLine('END:VCALENDAR');
  return out;
}
