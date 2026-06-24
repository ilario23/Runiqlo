'use client';

import {useEffect, useState} from 'react';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {COACH_KNOWLEDGE_CORE, KNOWLEDGE_TOPIC_SUMMARY, type KnowledgeTopic} from '@/lib/coachKnowledge';
import type {Goal, TrainingPlan, WeeklyPlan, AthleteNotes} from '@/lib/coachTypes';

function getMonday(date: Date = new Date()): string {
  const d = new Date(date);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

interface FitnessSnapshot {
  ctl: number;
  atl: number;
  tsb: number;
  acwr: number;
  rampRate: number;
  riskLevel: string;
}

type DataStatus = 'loading' | 'set' | 'unset';

interface DataSection {
  label: string;
  status: DataStatus;
  summary: string;
}

const GOAL_LABELS: Record<string, string> = {
  marathon: 'Marathon',
  half_marathon: 'Half Marathon',
  '10k': '10K',
  '5k': '5K',
  general_fitness: 'General Fitness',
};

const KNOWLEDGE_GROUPS: {title: string; topics: KnowledgeTopic[]}[] = [
  {title: 'Race Distances', topics: ['marathon', 'half_marathon', 'ultramarathon']},
  {title: 'Zones & Physiology', topics: ['thresholds_zones', 'zone2_fat', 'vdot_pacing', 'advanced_metrics', 'testing']},
  {title: 'Workouts & Progression', topics: ['intervals', 'mileage_progression', 'strength_training', 'hill_training', 'downhill_running', 'trail_running', 'intensity_models', 'cross_training_heat']},
  {title: 'Fueling', topics: ['fueling_hydration']},
  {title: 'Recovery & Injury', topics: ['tissue_adaptation', 'return_to_running', 'overtraining_syndrome', 'recovery', 'taper_peak']},
  {title: 'Special Populations', topics: ['female_athlete', 'masters_aging']},
  {title: 'Mental & Race Day', topics: ['psychology', 'race_day']},
];

function StatusPill({status}: {status: DataStatus}) {
  if (status === 'loading') {
    return <div className="h-[18px] w-14 rounded-full bg-[var(--color-surface-1)] animate-pulse flex-shrink-0" />;
  }
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
        status === 'set' ? 'bg-accent-green/10 text-accent-green' : 'bg-[var(--color-surface-1)] text-[var(--faint)]'
      }`}
    >
      {status === 'set' ? 'Active' : 'Not set'}
    </span>
  );
}

function DataRow({label, status, summary}: DataSection) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--color-surface-1)] transition-colors">
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--dim)]">{label}</p>
        <p className="text-[11px] text-[var(--faint)] mt-0.5 leading-relaxed">
          {status === 'loading' ? 'Loading…' : summary}
        </p>
      </div>
      <StatusPill status={status} />
    </div>
  );
}

function KnowledgeGroup({title, topics}: {title: string; topics: KnowledgeTopic[]}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-3.5 py-3 bg-[var(--color-surface-0)] hover:bg-[var(--color-surface-1)] transition-colors cursor-pointer"
      >
        <span className="text-xs font-medium text-[var(--text)]">{title}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] text-[var(--faint)] tabular-nums">{topics.length}</span>
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`text-[var(--faint)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>
      {open && (
        <div>
          {topics.map((t, i) => (
            <div
              key={t}
              className={`px-3.5 py-2.5 bg-[var(--color-surface-0)] ${i > 0 ? 'border-t border-[var(--color-border)]' : ''}`}
            >
              <p className="text-[11px] font-semibold text-[var(--dim)] capitalize">{t.replace(/_/g, ' ')}</p>
              <p className="text-[11px] text-[var(--faint)] mt-0.5 leading-relaxed">{KNOWLEDGE_TOPIC_SUMMARY[t]}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CoachKnowledgeCard() {
  const {athlete} = useStravaAuth();
  const [goal, setGoal] = useState<Goal | null | undefined>(undefined);
  const [fitness, setFitness] = useState<FitnessSnapshot | null | undefined>(undefined);
  const [plan, setPlan] = useState<TrainingPlan | null | undefined>(undefined);
  const [week, setWeek] = useState<WeeklyPlan | null | undefined>(undefined);
  const [notes, setNotes] = useState<AthleteNotes | null | undefined>(undefined);
  const [showCore, setShowCore] = useState(false);

  useEffect(() => {
    if (!athlete) return;
    const athleteId = athlete.id;
    const weekStart = getMonday();
    fetch(`/api/coach/goal?athleteId=${athleteId}`).then(r => r.json()).then(setGoal).catch(() => setGoal(null));
    fetch(`/api/coach/fitness?athleteId=${athleteId}`).then(r => r.json()).then(setFitness).catch(() => setFitness(null));
    fetch(`/api/coach/plan?athleteId=${athleteId}`).then(r => r.json()).then(setPlan).catch(() => setPlan(null));
    fetch(`/api/coach/week?athleteId=${athleteId}&weekStart=${weekStart}`).then(r => r.json()).then(setWeek).catch(() => setWeek(null));
    fetch(`/api/coach/notes?athleteId=${athleteId}`).then(r => r.json()).then(setNotes).catch(() => setNotes(null));
  }, [athlete]);

  const notesHasContent = !!notes && (
    notes.injuryHistory.length > 0 ||
    Object.keys(notes.preferences).length > 0 ||
    Object.keys(notes.responsePatterns).length > 0 ||
    !!notes.freeformNotes
  );

  const sections: DataSection[] = [
    {
      label: 'Goal',
      status: goal === undefined ? 'loading' : goal ? 'set' : 'unset',
      summary: goal
        ? `${GOAL_LABELS[goal.goalType] ?? goal.goalType}${goal.targetEventName ? ` — ${goal.targetEventName}` : ''}${goal.targetDate ? ` · ${goal.targetDate}` : ''}`
        : 'No goal set yet',
    },
    {
      label: 'Fitness Snapshot',
      status: fitness === undefined ? 'loading' : fitness ? 'set' : 'unset',
      summary: fitness
        ? `CTL ${fitness.ctl} · ATL ${fitness.atl} · TSB ${fitness.tsb} · Risk ${fitness.riskLevel}`
        : 'No fitness data yet — sync activities',
    },
    {
      label: 'Training Plan',
      status: plan === undefined ? 'loading' : plan ? 'set' : 'unset',
      summary: plan
        ? `${plan.phases[plan.currentPhaseIndex]?.phase ?? '?'} phase · ${plan.phases.length} phases · ${plan.phases.reduce((s, p) => s + p.weekCount, 0)} weeks total`
        : 'No active training plan',
    },
    {
      label: "This Week's Schedule",
      status: week === undefined ? 'loading' : week ? 'set' : 'unset',
      summary: week
        ? `Week ${week.weekNumber} (${week.phase}) · ${week.days.flatMap(d => d.workouts).length} workouts scheduled`
        : 'No plan generated for this week',
    },
    {
      label: 'Athlete Notes & Memory',
      status: notes === undefined ? 'loading' : notesHasContent ? 'set' : 'unset',
      summary: notesHasContent
        ? [
            notes!.injuryHistory.length ? `${notes!.injuryHistory.length} injury note${notes!.injuryHistory.length > 1 ? 's' : ''}` : null,
            Object.keys(notes!.preferences).length ? `${Object.keys(notes!.preferences).length} preference${Object.keys(notes!.preferences).length > 1 ? 's' : ''}` : null,
            Object.keys(notes!.responsePatterns).length ? `${Object.keys(notes!.responsePatterns).length} learned pattern${Object.keys(notes!.responsePatterns).length > 1 ? 's' : ''}` : null,
          ].filter(Boolean).join(' · ')
        : 'No accumulated knowledge yet',
    },
  ];

  const totalTopics = KNOWLEDGE_GROUPS.reduce((s, g) => s + g.topics.length, 0);

  return (
    <div className="surface-card p-5 space-y-5">
      {/* Your data */}
      <div>
        <p className="text-sm font-medium text-[var(--text)] mb-0.5">What the coach knows about you</p>
        <p className="text-xs text-[var(--faint)] mb-2">Live data injected into every conversation</p>
        <div className="space-y-0.5">
          {sections.map(s => <DataRow key={s.label} {...s} />)}
        </div>
      </div>

      <div className="h-px bg-[var(--color-border)]" />

      {/* Coaching approach */}
      <div>
        <p className="text-sm font-medium text-[var(--text)] mb-2">Coaching approach</p>
        <p className="text-xs text-[var(--faint)] leading-relaxed">
          Periodized training (Base → Build → Peak → Taper) mixing running, strength, cycling, and mobility.
          Always checks TSB and ACWR before prescribing hard sessions, and prioritizes injury prevention over
          aggressive progress.
        </p>
      </div>

      <div className="h-px bg-[var(--color-border)]" />

      {/* Core science */}
      <div>
        <button
          onClick={() => setShowCore(o => !o)}
          className="w-full flex items-center justify-between gap-3 cursor-pointer"
        >
          <div className="text-left">
            <p className="text-sm font-medium text-[var(--text)]">Core training science</p>
            <p className="text-xs text-[var(--faint)] mt-0.5">Always loaded — load, fatigue & intensity fundamentals</p>
          </div>
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`text-[var(--faint)] flex-shrink-0 transition-transform duration-200 ${showCore ? 'rotate-180' : ''}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {showCore && (
          <pre className="mt-3 text-[11px] text-[var(--faint)] leading-relaxed whitespace-pre-wrap font-sans bg-[var(--color-surface-0)] rounded-xl p-3.5 border border-[var(--color-border)]">
            {COACH_KNOWLEDGE_CORE}
          </pre>
        )}
      </div>

      <div className="h-px bg-[var(--color-border)]" />

      {/* On-demand library */}
      <div>
        <p className="text-sm font-medium text-[var(--text)] mb-0.5">On-demand expertise library</p>
        <p className="text-xs text-[var(--faint)] mb-3">
          {totalTopics} reference topics the coach fetches mid-conversation when relevant
        </p>
        <div className="space-y-1.5">
          {KNOWLEDGE_GROUPS.map(g => <KnowledgeGroup key={g.title} {...g} />)}
        </div>
      </div>
    </div>
  );
}
