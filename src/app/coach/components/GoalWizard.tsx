'use client';

import {useState} from 'react';
import {motion, AnimatePresence} from 'framer-motion';
import type {Goal, GoalType, ExperienceLevel} from '@/lib/coachTypes';

const GOAL_OPTIONS: Array<{type: GoalType; label: string; emoji: string; desc: string}> = [
  {type: 'marathon', label: 'Marathon', emoji: '🏅', desc: '42.2km — the ultimate test'},
  {type: 'half_marathon', label: 'Half Marathon', emoji: '🥈', desc: '21.1km — challenging & achievable'},
  {type: '10k', label: '10K', emoji: '🏃', desc: '10km — speed & endurance'},
  {type: '5k', label: '5K', emoji: '⚡', desc: '5km — fast & intense'},
  {type: 'general_fitness', label: 'General Fitness', emoji: '💪', desc: 'Stay fit, feel great'},
];

const EXPERIENCE_OPTIONS: Array<{level: ExperienceLevel; label: string; desc: string}> = [
  {level: 'beginner', label: 'Beginner', desc: 'New to structured training, <3 runs/week'},
  {level: 'intermediate', label: 'Intermediate', desc: '1–3 years, 3–5 runs/week'},
  {level: 'advanced', label: 'Advanced', desc: '3+ years, 5+ runs/week, have raced before'},
];

interface GoalWizardProps {
  athleteId: number;
  initialGoal?: Goal | null;
  onComplete: (goal: Goal) => void;
  onCancel?: () => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

export function GoalWizard({athleteId, initialGoal, onComplete, onCancel}: GoalWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [goalType, setGoalType] = useState<GoalType>(initialGoal?.goalType ?? 'marathon');
  const [targetDate, setTargetDate] = useState(initialGoal?.targetDate ?? '');
  const [eventName, setEventName] = useState(initialGoal?.targetEventName ?? '');
  const [weeklyHours, setWeeklyHours] = useState(initialGoal?.weeklyHoursAvailable ?? 6);
  const [experience, setExperience] = useState<ExperienceLevel>(initialGoal?.experienceLevel ?? 'intermediate');
  const [injuryHistory, setInjuryHistory] = useState(initialGoal?.injuryHistory ?? '');
  const [additionalNotes, setAdditionalNotes] = useState(initialGoal?.additionalNotes ?? '');
  const [saving, setSaving] = useState(false);

  const totalSteps = goalType === 'general_fitness' ? 4 : 5;

  const next = () => {
    if (step === 1 && goalType === 'general_fitness') { setStep(3); return; }
    setStep(s => Math.min(s + 1, 5) as Step);
  };
  const back = () => {
    if (step === 3 && goalType === 'general_fitness') { setStep(1); return; }
    setStep(s => Math.max(s - 1, 1) as Step);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/coach/goal', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          athleteId,
          goalType,
          targetDate: targetDate || null,
          targetEventName: eventName || null,
          weeklyHoursAvailable: weeklyHours,
          experienceLevel: experience,
          injuryHistory: injuryHistory || null,
          additionalNotes: additionalNotes || null,
        }),
      });
      const goal: Goal = await res.json();
      onComplete(goal);
    } finally {
      setSaving(false);
    }
  };

  const progressPct = ((step - 1) / (totalSteps - 1)) * 100;

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/95 backdrop-blur-xl flex items-center justify-center p-4">
      <motion.div
        initial={{opacity: 0, scale: 0.97, y: 12}}
        animate={{opacity: 1, scale: 1, y: 0}}
        className="w-full max-w-lg bg-gray-900 border border-white/[0.08] rounded-3xl overflow-hidden shadow-2xl"
      >
        {/* Progress bar */}
        <div className="h-1 bg-white/[0.06]">
          <motion.div
            className="h-full bg-[#0a84ff]"
            animate={{width: `${progressPct}%`}}
            transition={{type: 'spring', stiffness: 200, damping: 25}}
          />
        </div>

        <div className="p-8">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="step1" initial={{opacity: 0, x: 20}} animate={{opacity: 1, x: 0}} exit={{opacity: 0, x: -20}}>
                <h2 className="text-xl font-bold text-white mb-1">What's your goal?</h2>
                <p className="text-sm text-white/40 mb-6">This shapes your entire training plan</p>
                <div className="space-y-2">
                  {GOAL_OPTIONS.map(opt => (
                    <button
                      key={opt.type}
                      onClick={() => setGoalType(opt.type)}
                      className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all text-left ${
                        goalType === opt.type
                          ? 'border-[#0a84ff] bg-[#0a84ff]/10 text-white'
                          : 'border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/20 hover:text-white/80'
                      }`}
                    >
                      <span className="text-2xl">{opt.emoji}</span>
                      <div>
                        <div className="font-semibold text-sm">{opt.label}</div>
                        <div className="text-xs opacity-60">{opt.desc}</div>
                      </div>
                      {goalType === opt.type && (
                        <div className="ml-auto w-5 h-5 rounded-full bg-[#0a84ff] flex items-center justify-center">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{opacity: 0, x: 20}} animate={{opacity: 1, x: 0}} exit={{opacity: 0, x: -20}}>
                <h2 className="text-xl font-bold text-white mb-1">When's the race?</h2>
                <p className="text-sm text-white/40 mb-6">A deadline creates urgency and shapes your training phases</p>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-white/50 font-medium mb-1.5 block">Event name (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Berlin Marathon 2026"
                      value={eventName}
                      onChange={e => setEventName(e.target.value)}
                      className="w-full bg-white/[0.06] border border-white/[0.10] rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#0a84ff]/60"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 font-medium mb-1.5 block">Target date</label>
                    <input
                      type="date"
                      value={targetDate}
                      onChange={e => setTargetDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      className="w-full bg-white/[0.06] border border-white/[0.10] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#0a84ff]/60 [color-scheme:dark]"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step3" initial={{opacity: 0, x: 20}} animate={{opacity: 1, x: 0}} exit={{opacity: 0, x: -20}}>
                <h2 className="text-xl font-bold text-white mb-1">Training capacity</h2>
                <p className="text-sm text-white/40 mb-6">Be realistic — consistency beats heroics</p>
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-white/50 font-medium">Weekly hours available</label>
                      <span className="text-lg font-bold text-[#0a84ff]">{weeklyHours}h</span>
                    </div>
                    <input
                      type="range"
                      min={3} max={15} step={0.5}
                      value={weeklyHours}
                      onChange={e => setWeeklyHours(Number(e.target.value))}
                      className="w-full accent-[#0a84ff]"
                    />
                    <div className="flex justify-between text-xs text-white/25 mt-1">
                      <span>3h (minimal)</span><span>15h (elite)</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-white/50 font-medium mb-2 block">Experience level</label>
                    <div className="space-y-2">
                      {EXPERIENCE_OPTIONS.map(opt => (
                        <button
                          key={opt.level}
                          onClick={() => setExperience(opt.level)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                            experience === opt.level
                              ? 'border-[#0a84ff] bg-[#0a84ff]/10 text-white'
                              : 'border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/20'
                          }`}
                        >
                          <div className="flex-1">
                            <div className="font-semibold text-sm">{opt.label}</div>
                            <div className="text-xs opacity-60">{opt.desc}</div>
                          </div>
                          {experience === opt.level && (
                            <div className="w-4 h-4 rounded-full bg-[#0a84ff] flex items-center justify-center flex-shrink-0">
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div key="step4" initial={{opacity: 0, x: 20}} animate={{opacity: 1, x: 0}} exit={{opacity: 0, x: -20}}>
                <h2 className="text-xl font-bold text-white mb-1">Health & context</h2>
                <p className="text-sm text-white/40 mb-6">Your coach needs to know what to work around</p>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-white/50 font-medium mb-1.5 block">Injury history (optional)</label>
                    <textarea
                      rows={3}
                      placeholder="e.g. IT band issues 2024, mild plantar fasciitis in left foot (resolved)"
                      value={injuryHistory}
                      onChange={e => setInjuryHistory(e.target.value)}
                      className="w-full bg-white/[0.06] border border-white/[0.10] rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#0a84ff]/60 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/50 font-medium mb-1.5 block">Anything else? (optional)</label>
                    <textarea
                      rows={2}
                      placeholder="e.g. prefer morning runs, travel often, no gym access"
                      value={additionalNotes}
                      onChange={e => setAdditionalNotes(e.target.value)}
                      className="w-full bg-white/[0.06] border border-white/[0.10] rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#0a84ff]/60 resize-none"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {step === 5 && (
              <motion.div key="step5" initial={{opacity: 0, x: 20}} animate={{opacity: 1, x: 0}} exit={{opacity: 0, x: -20}}>
                <h2 className="text-xl font-bold text-white mb-1">Ready to go! 🚀</h2>
                <p className="text-sm text-white/40 mb-6">Here's your plan setup:</p>
                <div className="space-y-3 mb-6">
                  {[
                    {label: 'Goal', value: GOAL_OPTIONS.find(o => o.type === goalType)?.label},
                    eventName && {label: 'Event', value: eventName},
                    targetDate && {label: 'Target date', value: targetDate},
                    {label: 'Weekly hours', value: `${weeklyHours}h`},
                    {label: 'Level', value: experience.charAt(0).toUpperCase() + experience.slice(1)},
                  ].filter(Boolean).map((item: any) => (
                    <div key={item.label} className="flex items-center justify-between py-2 border-b border-white/[0.06]">
                      <span className="text-sm text-white/50">{item.label}</span>
                      <span className="text-sm text-white font-medium">{item.value}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-white/30 text-center">Your coach will create a personalised periodized training plan after setup.</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-4 border-t border-white/[0.06]">
            <button
              onClick={step === 1 && onCancel ? onCancel : back}
              className="text-sm text-white/40 hover:text-white/70 transition-colors px-2 py-1"
            >
              {step === 1 ? (onCancel ? 'Cancel' : '') : 'Back'}
            </button>

            {step < 5 ? (
              <button
                onClick={next}
                className="px-6 py-2.5 rounded-xl bg-[#0a84ff] text-white text-sm font-semibold hover:bg-[#0a84ff]/90 transition-colors"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-[#0a84ff] text-white text-sm font-semibold hover:bg-[#0a84ff]/90 transition-colors disabled:opacity-50"
              >
                {saving ? 'Setting up…' : 'Start Planning'}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
