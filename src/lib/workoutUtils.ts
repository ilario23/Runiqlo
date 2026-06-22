import type {WorkoutBlock, WorkoutStep, RepeatBlock} from './coachTypes';
import type {UserSettings} from './activityModel';

export function isRepeatBlock(block: WorkoutBlock): block is RepeatBlock {
  return 'repeatCount' in block;
}

// Map a % LTHR value to the athlete's custom 6-zone model.
// Bands mirror the coach's LTHR reference (coachContext.ts):
// Z1 60–69, Z2 70–82, Z3 83–94, Z4 95–105, Z5 106–120, Z6 >120.
function zoneFromLthrPct(pct: number): keyof UserSettings['zones'] {
  if (pct <= 69) return 'z1';
  if (pct <= 82) return 'z2';
  if (pct <= 94) return 'z3';
  if (pct <= 105) return 'z4';
  if (pct <= 120) return 'z5';
  return 'z6';
}

// Derive a real bpm range from the step's intensity (% LTHR) using the
// athlete's actual zone bpm boundaries. Single source of truth — the LLM
// never supplies bpm (it has no LTHR to compute from, and hallucinated
// "1–1 bpm" placeholders). Returns null when zones are unavailable.
export function bpmRangeFromIntensity(
  intensityMin: number,
  intensityMax: number,
  zones: UserSettings['zones'] | undefined,
): {bpmMin: number; bpmMax: number} | null {
  if (!zones) return null;
  const lo = Math.min(intensityMin, intensityMax);
  const hi = Math.max(intensityMin, intensityMax);
  const bpmMin = zones[zoneFromLthrPct(lo)][0];
  const bpmMax = zones[zoneFromLthrPct(hi)][1];
  if (!Number.isFinite(bpmMin) || !Number.isFinite(bpmMax)) return null;
  return {bpmMin, bpmMax};
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
