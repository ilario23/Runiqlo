'use client';

import {useState, useEffect, useCallback} from 'react';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import AppHeader from '@/components/AppHeader';
import {GoalWizard} from './components/GoalWizard';
import {GoalCard} from './components/GoalCard';
import {ChatPanel} from './components/ChatPanel';
import {WeekPlan} from './components/WeekPlan';
import {PlanOverview} from './components/PlanOverview';
import type {Goal, TrainingPlan} from '@/lib/coachTypes';

type PlanTab = 'week' | 'plan';

export default function CoachPage() {
  const {athlete} = useStravaAuth();
  const [goal, setGoal] = useState<Goal | null | undefined>(undefined);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [activeTab, setActiveTab] = useState<PlanTab>('week');
  const [weekStart, setWeekStart] = useState<string | undefined>(undefined);
  const [initialMessage, setInitialMessage] = useState<string | undefined>(undefined);
  const [planKey, setPlanKey] = useState(0);

  // Use optional chaining for hook deps — safe to be undefined before auth check
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

  const handleGoalComplete = (newGoal: Goal) => {
    setGoal(newGoal);
    setShowWizard(false);
    setInitialMessage('I just set my goal. Please analyse my current fitness and create a comprehensive periodized training plan for me.');
  };

  const handlePlanSaved = () => {
    fetchPlan();
    setPlanKey(k => k + 1);
  };

  const currentPhase = plan
    ? (plan.phases as Array<{phase: string}>)[plan.currentPhaseIndex]?.phase
    : undefined;

  // Not authenticated
  if (!athlete) {
    return (
      <div className="min-h-screen bg-gray-950">
        <AppHeader />
        <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] mt-14">
          <p className="text-white/50 text-sm">Connect Strava to use the coach</p>
        </div>
      </div>
    );
  }

  // athleteId is a number past this guard
  const athleteId = athlete.id;

  // Loading goal
  if (goal === undefined) {
    return (
      <div className="min-h-screen bg-gray-950">
        <AppHeader />
        <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] mt-14">
          <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
        </div>
      </div>
    );
  }

  // Show wizard if no goal or editing
  if (!goal || showWizard) {
    return (
      <>
        <AppHeader />
        <GoalWizard
          athleteId={athleteId}
          initialGoal={goal}
          onComplete={handleGoalComplete}
          onCancel={goal ? () => setShowWizard(false) : undefined}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden pt-14">
        {/* Chat panel — left column */}
        <div className="w-96 flex-shrink-0 border-r border-white/[0.07] flex flex-col">
          <ChatPanel
            athleteId={athleteId}
            initialMessage={initialMessage}
            onPlanSaved={handlePlanSaved}
          />
        </div>

        {/* Plan panel — right column */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-4 max-w-4xl mx-auto">
            <GoalCard
              goal={goal}
              currentPhase={currentPhase}
              onEdit={() => setShowWizard(true)}
            />

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
          </div>
        </div>
      </div>
    </div>
  );
}
