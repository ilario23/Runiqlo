'use client';

import {useState, useEffect, useCallback, Suspense} from 'react';
import {useSearchParams, useRouter} from 'next/navigation';
import Link from 'next/link';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import AppHeader from '@/components/AppHeader';
import {GoalBanner} from './components/GoalBanner';
import {WeekPlan} from './components/WeekPlan';
import {PlanOverview} from './components/PlanOverview';
import {AskCoachBar} from './components/AskCoachBar';
import type {Goal, TrainingPlan} from '@/lib/coachTypes';
import {CalendarDays} from 'lucide-react';

type PlanView = 'week' | 'plan';

function PlanPageInner() {
  const {athlete} = useStravaAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Capture at mount — router.replace would clear searchParams on re-render
  const [weekParam] = useState(() => searchParams.get('week') ?? undefined);

  const [goal, setGoal] = useState<Goal | null | undefined>(undefined);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [view, setView] = useState<PlanView>('week');
  const [weekStart, setWeekStart] = useState<string | undefined>(weekParam);
  const [planKey, setPlanKey] = useState(0);

  const athleteIdMaybe = athlete?.id;

  const fetchGoal = useCallback(async () => {
    if (!athleteIdMaybe) return;
    try {
      const res = await fetch(`/api/coach/goal?athleteId=${athleteIdMaybe}`);
      setGoal(await res.json());
    } catch {
      setGoal(null);
    }
  }, [athleteIdMaybe]);

  const fetchPlan = useCallback(async () => {
    if (!athleteIdMaybe) return;
    try {
      const res = await fetch(`/api/coach/plan?athleteId=${athleteIdMaybe}`);
      setPlan(await res.json());
    } catch {
      setPlan(null);
    }
  }, [athleteIdMaybe]);

  useEffect(() => {
    fetchGoal();
    fetchPlan();
  }, [fetchGoal, fetchPlan]);

  // Clean ?week= param from URL after reading it
  useEffect(() => {
    if (weekParam) {
      router.replace('/plan', {scroll: false});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentPhase = plan
    ? (plan.phases as Array<{phase: string}>)[plan.currentPhaseIndex]?.phase
    : undefined;

  // ── Not connected ─────────────────────────────────────────────────────────────
  if (!athlete) {
    return (
      <div className="min-h-screen" style={{background: 'var(--color-base)'}}>
        <AppHeader />
        <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] mt-14">
          <p style={{color: 'var(--color-text-3)'}} className="text-sm">
            Connect Strava to view your plan
          </p>
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (goal === undefined) {
    return (
      <div className="min-h-screen" style={{background: 'var(--color-base)'}}>
        <AppHeader />
        <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] mt-14">
          <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
        </div>
      </div>
    );
  }

  const athleteId = athlete.id;

  // ── No plan yet ───────────────────────────────────────────────────────────────
  if (goal === null) {
    return (
      <div className="flex flex-col h-dvh" style={{background: 'var(--color-base)'}}>
        <AppHeader />
        <div className="flex flex-col flex-1 items-center justify-center gap-4 mt-14 px-5">
          <CalendarDays className="w-10 h-10 text-white/20" />
          <div className="text-center">
            <p className="text-sm font-medium text-white/60 mb-1">No training plan yet</p>
            <p className="text-xs text-white/30">Chat with your coach to set one up</p>
          </div>
          <Link
            href="/coach"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{background: 'var(--color-accent)', color: 'white'}}
          >
            Chat with Coach →
          </Link>
        </div>
      </div>
    );
  }

  // ── Main layout ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-dvh" style={{background: 'var(--color-base)'}}>
      <AppHeader />

      <div className="flex flex-col flex-1 min-h-0 pt-14">
        <GoalBanner goal={goal} currentPhase={currentPhase} />

        {/* View toggle */}
        <div
          className="flex-shrink-0 flex items-center border-b border-[var(--color-border)]"
          style={{background: 'var(--color-base)', paddingLeft: '20px'}}
        >
          {([
            {v: 'week' as PlanView, label: 'This Week'},
            {v: 'plan' as PlanView, label: 'Training Plan'},
          ]).map(({v, label}) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 pb-2.5 pt-2.5 text-xs font-semibold uppercase tracking-wide transition-colors border-b-2 -mb-px cursor-pointer ${
                view === v
                  ? 'text-white border-[var(--color-accent)]'
                  : 'text-white/35 hover:text-white/60 border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto pb-[calc(52px_+_56px_+_env(safe-area-inset-bottom))] md:pb-[52px]">
          <div className="max-w-[1100px] mx-auto px-5 py-5">
            {view === 'week' ? (
              <WeekPlan
                key={`week-${planKey}`}
                athleteId={athleteId}
                initialWeekStart={weekStart}
              />
            ) : (
              <PlanOverview
                key={`plan-${planKey}`}
                athleteId={athleteId}
                onWeekClick={(ws) => {
                  setWeekStart(ws);
                  setView('week');
                }}
                onPlanRestored={() => {
                  fetchGoal();
                  fetchPlan();
                  setPlanKey(k => k + 1);
                }}
              />
            )}
          </div>
        </main>
      </div>

      <AskCoachBar view={view} weekStart={weekStart} />
    </div>
  );
}

export default function PlanPage() {
  return (
    <Suspense fallback={null}>
      <PlanPageInner />
    </Suspense>
  );
}
