'use client';

import {useState} from 'react';

const TOOL_LABELS: Record<string, string> = {
  getFitnessSummary: 'Checked fitness metrics',
  getRecentActivities: 'Looked up recent activities',
  getZoneDistribution: 'Analysed zone distribution',
  getBestEfforts: 'Fetched personal bests',
  getTrainingPlan: 'Read training plan',
  getWeeklyPlan: 'Checked weekly schedule',
  getAthleteNotes: 'Reviewed athlete notes',
  saveTrainingPlan: 'Saved training plan',
  saveWeeklyPlan: 'Saved weekly plan',
  setGoal: 'Saved goal',
  getPeakWeeklyKm: 'Calculated peak weekly km',
  updateAthleteNotes: 'Updated athlete notes',
  linkCompletedActivity: 'Linked Strava activity',
  askQuestion: 'Asked a question',
  getAdherenceSummary: 'Checked training adherence',
  getActivityWeather: 'Checked activity weather',
  getWeatherForecast: 'Fetched weather forecast',
  getDecouplingTrend: 'Analysed aerobic decoupling',
  getGearStatus: 'Checked gear status',
  getWeekSketches: 'Read week volume targets',
};

const TOOL_LABELS_RUNNING: Record<string, string> = {
  getFitnessSummary: 'Checking fitness metrics',
  getRecentActivities: 'Looking up recent activities',
  getZoneDistribution: 'Analysing zone distribution',
  getBestEfforts: 'Fetching personal bests',
  getTrainingPlan: 'Reading training plan',
  getWeeklyPlan: 'Checking weekly schedule',
  getAthleteNotes: 'Reviewing athlete notes',
  saveTrainingPlan: 'Saving training plan',
  saveWeeklyPlan: 'Saving weekly plan',
  setGoal: 'Saving goal',
  getPeakWeeklyKm: 'Calculating peak weekly km',
  updateAthleteNotes: 'Updating athlete notes',
  linkCompletedActivity: 'Linking Strava activity',
  askQuestion: 'Asking a question',
  getAdherenceSummary: 'Checking training adherence',
  getActivityWeather: 'Checking activity weather',
  getWeatherForecast: 'Fetching weather forecast',
  getDecouplingTrend: 'Analysing aerobic decoupling',
  getGearStatus: 'Checking gear status',
  getWeekSketches: 'Reading week volume targets',
};

interface ToolCallRowProps {
  name: string;
  status: 'running' | 'done';
  input?: unknown;
  output?: unknown;
}

export function ToolCallRow({name, status, input, output}: ToolCallRowProps) {
  const [expanded, setExpanded] = useState(false);
  const label = status === 'running'
    ? (TOOL_LABELS_RUNNING[name] ?? name)
    : (TOOL_LABELS[name] ?? name);
  const isDone = status === 'done';
  const hasDetail = isDone && (input !== undefined || output !== undefined);

  return (
    <div className="my-1">
      <button
        onClick={() => hasDetail && setExpanded(v => !v)}
        disabled={!hasDetail}
        className={[
          'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs transition-colors w-auto',
          hasDetail
            ? 'hover:bg-[var(--color-surface-2)] cursor-pointer'
            : 'cursor-default',
        ].join(' ')}
      >
        {/* Status icon */}
        <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
          {isDone ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-[var(--color-accent-green)]" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg className="animate-spin text-[var(--color-text-3)]" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          )}
        </span>

        <span className={isDone ? 'text-[var(--color-text-2)]' : 'text-[var(--color-text-2)]'}>
          {label}
        </span>

        {/* Expand chevron */}
        {hasDetail && (
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
            className={[
              'text-[var(--color-text-2)] ml-0.5 transition-transform flex-shrink-0',
              expanded ? 'rotate-180' : '',
            ].join(' ')}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && hasDetail && (
        <div className="ml-9 mt-1 mb-2 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] overflow-hidden">
          {input !== undefined && (
            <div className="px-3 py-2 border-b border-[var(--color-border)] last:border-0">
              <div className="text-[10px] text-[var(--color-text-2)] uppercase tracking-wider font-medium mb-1">Input</div>
              <pre className="text-[11px] font-mono text-[var(--color-text-2)] whitespace-pre-wrap break-all">
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}
          {output !== undefined && (
            <div className="px-3 py-2">
              <div className="text-[10px] text-[var(--color-text-2)] uppercase tracking-wider font-medium mb-1">Output</div>
              <pre className="text-[11px] font-mono text-[var(--color-text-2)] whitespace-pre-wrap break-all">
                {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
