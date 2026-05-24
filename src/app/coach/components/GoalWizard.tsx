'use client';

import {useState, useEffect} from 'react';
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

// Target time placeholders by goal type
const TARGET_TIME_PLACEHOLDER: Record<GoalType, string> = {
  marathon: 'e.g. 3:45',
  half_marathon: 'e.g. 1:50',
  '10k': 'e.g. 52:00',
  '5k': 'e.g. 24:00',
  general_fitness: '',
};

function parseTimeToMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length === 2) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!isNaN(h) && !isNaN(m)) return h * 60 + m;
  }
  if (parts.length === 1) {
    const n = parseInt(parts[0], 10);
    if (!isNaN(n)) return n;
  }
  return null;
}

function minutesToTimeString(minutes: number | null): string {
  if (minutes === null) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

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
  const [targetTimeStr, setTargetTimeStr] = useState(minutesToTimeString(initialGoal?.targetTimeMinutes ?? null));
  const [recentPeakWeeklyKm, setRecentPeakWeeklyKm] = useState<string>(
    initialGoal?.recentPeakWeeklyKm != null ? String(initialGoal.recentPeakWeeklyKm) : '',
  );
  const [peakKmLoading, setPeakKmLoading] = useState(initialGoal?.recentPeakWeeklyKm == null);

  useEffect(() => {
    if (initialGoal?.recentPeakWeeklyKm != null) return;
    fetch(`/api/coach/peak-weekly-km?athleteId=${athleteId}`)
      .then(r => r.json())
      .then((data: {peakWeeklyKm: number | null}) => {
        if (data.peakWeeklyKm != null) setRecentPeakWeeklyKm(String(data.peakWeeklyKm));
      })
      .catch(() => {})
      .finally(() => setPeakKmLoading(false));
  }, [athleteId, initialGoal?.recentPeakWeeklyKm]);
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
          targetTimeMinutes: parseTimeToMinutes(targetTimeStr),
          recentPeakWeeklyKm: recentPeakWeeklyKm ? Number(recentPeakWeeklyKm) : null,
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
                <h2 className="text-xl font-bold text-white mb-1">Race details</h2>
                <p className="text-sm text-white/40 mb-6">A target time and deadline shape every workout</p>
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
                  <div>
                    <label className="text-xs text-white/50 font-medium mb-1.5 block">
                      Goal finish time <span className="text-white/25">(h:mm — optional but strongly recommended)</span>
                    </label>
                    <input
                      type="text"
                      placeholder={TARGET_TIME_PLACEHOLDER[goalType]}
                      value={targetTimeStr}
                      onChange={e => setTargetTimeStr(e.target.value)}
                      className="w-full bg-white/[0.06] border border-white/[0.10] rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#0a84ff]/60 font-mono"
                    />
                    <p className="text-xs text-white/25 mt-1.5">This sets every pace target in your plan. Without it the coach will estimate from your Strava history.</p>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step3" initial={{opacity: 0, x: 20}} animate={{opacity: 1, x: 0}} exit={{opacity: 0, x: -20}}>
                <h2 className="text-xl font-bold text-white mb-1">Training background</h2>
                <p className="text-sm text-white/40 mb-6">Helps the coach start at the right volume safely</p>
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-white/50 font-medium">
                        Highest weekly km in the past 3 months
                      </label>
                      {peakKmLoading ? (
                        <span className="text-xs text-white/25 flex items-center gap-1">
                          <svg className="animate-spin" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                          Calculating…
                        </span>
                      ) : recentPeakWeeklyKm ? (
                        <span className="text-xs text-[#fc4c02]/80 font-medium">from Strava</span>
                      ) : null}
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={300}
                        step={5}
                        placeholder={peakKmLoading ? 'Calculating from activities…' : 'e.g. 55'}
                        value={recentPeakWeeklyKm}
                        onChange={e => setRecentPeakWeeklyKm(e.target.value)}
                        className="w-full bg-white/[0.06] border border-white/[0.10] rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#0a84ff]/60 pr-10"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/30">km</span>
                    </div>
                    <p className="text-xs text-white/25 mt-1.5">Sets the safe starting point for your base phase. The coach asks for your available days each week.</p>
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
                <h2 className="text-xl font-bold text-white mb-1">Ready to go!</h2>
                <p className="text-sm text-white/40 mb-6">Here's your plan setup:</p>
                <div className="space-y-3 mb-6">
                  {[
                    {label: 'Goal', value: GOAL_OPTIONS.find(o => o.type === goalType)?.label},
                    eventName && {label: 'Event', value: eventName},
                    targetDate && {label: 'Target date', value: targetDate},
                    parseTimeToMinutes(targetTimeStr) !== null && {label: 'Target time', value: targetTimeStr},
                    recentPeakWeeklyKm && {label: 'Peak weekly km', value: `${recentPeakWeeklyKm} km`},
                    {label: 'Level', value: experience.charAt(0).toUpperCase() + experience.slice(1)},
                  ].filter(Boolean).map((item: any) => (
                    <div key={item.label} className="flex items-center justify-between py-2 border-b border-white/[0.06]">
                      <span className="text-sm text-white/50">{item.label}</span>
                      <span className="text-sm text-white font-medium">{item.value}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-white/30 text-center">Your coach will create a personalised periodized training plan. Available days will be confirmed each week.</p>
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
