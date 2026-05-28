'use client';

import {useState, useEffect, useCallback} from 'react';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import AppHeader from '@/components/AppHeader';
import {GoalBanner} from './components/GoalBanner';
import {CoachBar} from './components/CoachBar';
import {ChatPanel} from './components/ChatPanel';
import {WeekPlan} from './components/WeekPlan';
import {PlanOverview} from './components/PlanOverview';
import type {Goal, TrainingPlan} from '@/lib/coachTypes';

type PlanView = 'week' | 'plan';

const ONBOARDING_MESSAGE = "Hi! I'd like to set up my training plan with you. Walk me through it.";

export default function CoachPage() {
  const {athlete} = useStravaAuth();
  const [goal, setGoal] = useState<Goal | null | undefined>(undefined);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [view, setView] = useState<PlanView>('week');
  const [weekStart, setWeekStart] = useState<string | undefined>(undefined);
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

  const handleCoachTurnFinished = useCallback(() => {
    fetchGoal();
    fetchPlan();
    setPlanKey(k => k + 1);
  }, [fetchGoal, fetchPlan]);

  const currentPhase = plan
    ? (plan.phases as Array<{phase: string}>)[plan.currentPhaseIndex]?.phase
    : undefined;

  // ── Not connected ────────────────────────────────────────────────────────────
  if (!athlete) {
    return (
      <div className="min-h-screen" style={{background: 'var(--color-base)'}}>
        <AppHeader />
        <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] mt-14">
          <p style={{color: 'var(--color-text-3)'}} className="text-sm">
            Connect Strava to use the coach
          </p>
        </div>
      </div>
    );
  }

  // ── Loading goal ─────────────────────────────────────────────────────────────
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

  // ── Onboarding — no goal set yet ─────────────────────────────────────────────
  // Chat fills the full screen so the athlete can set up their plan immediately.
  if (goal === null) {
    return (
      <div className="flex flex-col h-dvh" style={{background: 'var(--color-base)'}}>
        <AppHeader />

        {/* Onboarding banner */}
        <div
          className="flex-shrink-0 flex items-center gap-3 px-5 pt-14 border-b border-[var(--color-border)]"
          style={{height: 'calc(40px + 56px)', background: 'var(--color-surface-0)'}}
        >
          <div
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{background: 'var(--color-accent)'}}
          />
          <span className="text-xs font-semibold text-white">Setting up your plan</span>
          <span className="text-[10px] text-white/30 ml-1">Answer a few questions to get started</span>
        </div>

        {/* Full-screen chat */}
        <div className="flex-1 overflow-hidden">
          <ChatPanel
            athleteId={athleteId}
            initialMessage={ONBOARDING_MESSAGE}
            onPlanSaved={handleCoachTurnFinished}
          />
        </div>
      </div>
    );
  }

  // ── Main layout — plan + coach bar ───────────────────────────────────────────
  return (
    <div className="flex flex-col h-dvh" style={{background: 'var(--color-base)'}}>
      <AppHeader />

      {/* Body: everything below the fixed header */}
      <div className="flex flex-col flex-1 min-h-0 pt-14">

        {/* Goal banner — slim info rail */}
        <GoalBanner goal={goal} currentPhase={currentPhase} />

        {/* View toggle — week / full plan */}
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

        {/* Scrollable plan content */}
        <main className="flex-1 overflow-y-auto pb-14 md:pb-[52px]">
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

      {/* Coach command bar — fixed bottom, with slide-up chat overlay */}
      <CoachBar
        athleteId={athleteId}
        onPlanSaved={handleCoachTurnFinished}
      />
    </div>
  );
}
