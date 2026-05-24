'use client';

import {useState, useEffect, useCallback} from 'react';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import AppHeader from '@/components/AppHeader';
import {GoalCard} from './components/GoalCard';
import {ChatPanel} from './components/ChatPanel';
import {WeekPlan} from './components/WeekPlan';
import {PlanOverview} from './components/PlanOverview';
import type {Goal, TrainingPlan} from '@/lib/coachTypes';

type PlanTab = 'week' | 'plan';

const ONBOARDING_MESSAGE = "Hi! I'd like to set up my training plan with you. Walk me through it.";

export default function CoachPage() {
  const {athlete} = useStravaAuth();
  const [goal, setGoal] = useState<Goal | null | undefined>(undefined);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [activeTab, setActiveTab] = useState<PlanTab>('week');
  const [weekStart, setWeekStart] = useState<string | undefined>(undefined);
  const [planKey, setPlanKey] = useState(0);

  const athleteIdMaybe = athlete?.id;

  const fetchGoal = useCallback(async () => {
    if (!athleteIdMaybe) return;
    try {
      const res = await fetch(`/api/coach/goal?athleteId=${athleteIdMaybe}`);
      const data = await res.json();
      setGoal(data);
    } catch {
      setGoal(null);
    }
  }, [athleteIdMaybe]);

  const fetchPlan = useCallback(async () => {
    if (!athleteIdMaybe) return;
    try {
      const res = await fetch(`/api/coach/plan?athleteId=${athleteIdMaybe}`);
      const data = await res.json();
      setPlan(data);
    } catch {
      setPlan(null);
    }
  }, [athleteIdMaybe]);

  useEffect(() => {
    fetchGoal();
    fetchPlan();
  }, [fetchGoal, fetchPlan]);

  // After every coach turn, re-check goal + plan so the right panel reflects new state.
  const handleCoachTurnFinished = useCallback(() => {
    fetchGoal();
    fetchPlan();
    setPlanKey(k => k + 1);
  }, [fetchGoal, fetchPlan]);

  const currentPhase = plan
    ? (plan.phases as Array<{phase: string}>)[plan.currentPhaseIndex]?.phase
    : undefined;

  // Auto-send the onboarding prompt only when we know goal is null (not undefined/loading).
  const initialMessage = goal === null ? ONBOARDING_MESSAGE : undefined;

  if (!athlete) {
    return (
      <div className="min-h-screen bg-[#070708]">
        <AppHeader />
        <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] mt-14">
          <p className="text-white/50 text-sm">Connect Strava to use the coach</p>
        </div>
      </div>
    );
  }

  const athleteId = athlete.id;

  if (goal === undefined) {
    return (
      <div className="min-h-screen bg-[#070708]">
        <AppHeader />
        <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] mt-14">
          <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#070708]">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden pt-14">
        {/* Chat panel — left column */}
        <div className="w-96 flex-shrink-0 border-r border-white/[0.07] flex flex-col">
          <ChatPanel
            athleteId={athleteId}
            initialMessage={initialMessage}
            onPlanSaved={handleCoachTurnFinished}
          />
        </div>

        {/* Right column */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-4 max-w-4xl mx-auto">
            {goal ? (
              <>
                <GoalCard goal={goal} currentPhase={currentPhase} />

                <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.06] rounded-xl p-1 w-fit">
                  {(['week', 'plan'] as PlanTab[]).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        activeTab === tab
                          ? 'bg-white/[0.10] text-white'
                          : 'text-white/40 hover:text-white/70'
                      }`}
                    >
                      {tab === 'week' ? 'This Week' : 'Training Plan'}
                    </button>
                  ))}
                </div>

                {activeTab === 'week' ? (
                  <WeekPlan
                    key={`week-${planKey}`}
                    athleteId={athleteId}
                    initialWeekStart={weekStart}
                  />
                ) : (
                  <PlanOverview
                    key={`plan-${planKey}`}
                    athleteId={athleteId}
                    onWeekClick={ws => {
                      setWeekStart(ws);
                      setActiveTab('week');
                    }}
                  />
                )}
              </>
            ) : (
              <OnboardingWelcome />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OnboardingWelcome() {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-accent-blue/[0.08] via-white/[0.03] to-transparent p-8 mt-8">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-accent-blue/20 flex items-center justify-center flex-shrink-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-blue" strokeWidth="1.5">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
          </svg>
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-white">Setting up your training plan</h2>
          <p className="text-sm text-white/60 mt-1 leading-relaxed">
            The coach is asking you a few questions in the chat to understand your goal, schedule, and history.
            Your answers are saved as memory and used to build every plan.
          </p>
          <div className="mt-4 space-y-2">
            {[
              'Goal & target race',
              'Experience level',
              'Preferred long run day',
              'Gym access',
              'Injury history',
            ].map(item => (
              <div key={item} className="flex items-center gap-2 text-xs text-white/40">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                </svg>
                <span>{item}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-white/30 mt-5">
            Once setup is complete, your training plan and weekly schedule will appear right here.
          </p>
        </div>
      </div>
    </div>
  );
}
