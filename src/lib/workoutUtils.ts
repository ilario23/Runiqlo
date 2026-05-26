import type {WorkoutBlock, WorkoutStep, RepeatBlock} from './coachTypes';

export function isRepeatBlock(block: WorkoutBlock): block is RepeatBlock {
  return 'repeatCount' in block;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function isValidStep(s: unknown): s is WorkoutStep {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  return (
    ['warmup', 'training', 'rest', 'cooldown'].includes(o.stepType as string) &&
    typeof o.durationSeconds === 'number' &&
    typeof o.zoneName === 'string' &&
    typeof o.intensityMin === 'number' &&
    typeof o.intensityMax === 'number'
  );
}

function isValidRepeat(b: unknown): b is RepeatBlock {
  if (!b || typeof b !== 'object') return false;
  const o = b as Record<string, unknown>;
  return (
    typeof o.repeatCount === 'number' &&
    Array.isArray(o.steps) &&
    (o.steps as unknown[]).every(isValidStep)
  );
}

export function parseStructuredSteps(raw: unknown): WorkoutBlock[] | null {
  if (!Array.isArray(raw)) return null;
  const result: WorkoutBlock[] = [];
  for (const block of raw) {
    if (isValidStep(block)) result.push(block as WorkoutStep);
    else if (isValidRepeat(block)) result.push(block as RepeatBlock);
    else return null;
  }
  return result.length > 0 ? result : null;
}
