/**
 * Training-science knowledge for the coach.
 *
 * Two tiers:
 *  - COACH_KNOWLEDGE_CORE  → injected into every system prompt. Small, relevant to
 *    every load/intensity decision (PMC interpretation, ramp/ACWR, 80/20).
 *  - KNOWLEDGE_TOPICS      → fetched on demand via the getCoachingKnowledge tool.
 *    Bulky, topic-specific. Keeps per-turn token cost flat as the base grows.
 *
 * Sources: TrainingPeaks edu/blog articles + Joe Friel PMC series; plus established
 * endurance science — Stephen Seiler (polarized / 3-zone intensity distribution),
 * Jack Daniels (VDOT training paces), and peer-reviewed VO2max-interval research.
 * Update when new evidence contradicts a rule.
 */

/** Always inline. Needed for any load or plan decision. */
export const COACH_KNOWLEDGE_CORE = `## Training Science — Core (PMC & Load)
- TSS: 100 = 1-hour all-out at threshold; capped at 100 TSS/hr; relative to each athlete's threshold.
- CTL (Fitness): 42-day EWMA of TSS. ATL (Fatigue): 7-day EWMA. TSB (Form) = CTL − ATL.

TSB target ranges:
- Race day (A): +15 to +25 (best); +5 to +10 ok for some. B-race: −10 to 0, trending positive.
- Productive hard training (base/build): −10 to −30. Below −30 → high injury/illness risk. Above +25 → too easy, fitness eroding.
- −10 to +10 should be brief (peaking or recovering); 2+ weeks here = stagnant.

CTL ramp: 1–2 CTL points/week optimal (3+ = strain; up to 5 only in a camp block). Recovery week every 3–4 weeks at 85% of prior. Never chase rapid CTL spikes.

Workout TSS by current CTL: hard = CTL×1.5–2.0, moderate = CTL×1.25, easy = CTL×0.75.

ACWR (ATL/CTL): >1.5 HIGH risk, 1.3–1.5 MODERATE, <1.3 LOW.

Intensity distribution: 80/20 — ~80% volume below threshold (Zone 1–2), ~20% above. Minimize Zone 3 "grey zone" for continuous efforts. Progressive overload: ≤10% weekly volume increase.`;

/** Topic keys — keep in sync with the getCoachingKnowledge tool enum. */
export const KNOWLEDGE_TOPIC_KEYS = [
  'thresholds_zones',
  'intervals',
  'mileage_progression',
  'marathon',
  'half_marathon',
  'ultramarathon',
  'fueling_hydration',
  'zone2_fat',
  'taper_peak',
  'recovery',
  'psychology',
  'cross_training_heat',
  'tissue_adaptation',
  'strength_training',
  'trail_running',
  'testing',
  'race_day',
  'return_to_running',
  'female_athlete',
  'downhill_running',
  'advanced_metrics',
  'intensity_models',
  'vdot_pacing',
] as const;

export type KnowledgeTopic = (typeof KNOWLEDGE_TOPIC_KEYS)[number];

/** One-line description per topic — used to build the tool description so the coach knows what each covers. */
export const KNOWLEDGE_TOPIC_SUMMARY: Record<KnowledgeTopic, string> = {
  thresholds_zones: 'lactate threshold, talk test, zone model, intensity distribution',
  intervals: 'Norwegian threshold method, Rønnestad 30/15, fatigue-resistance protocols',
  mileage_progression: 'safe volume increase, frequency vs long run, time vs distance, runner load management',
  marathon: 'marathon phases, weekly mileage, long-run progression, 6 essential workouts',
  half_marathon: 'half-marathon workouts, base-phase rule, negative splits, timeline',
  ultramarathon: 'ultra volume, back-to-back longs, trail pacing, terrain specificity',
  fueling_hydration: 'carb intake g/hr, glucose:fructose, gut training, sodium, gels, pre-race meal',
  zone2_fat: 'Zone 2 metabolic flexibility, fat oxidation, fasted vs fueled rides',
  taper_peak: 'taper timeline, volume cuts, shedding fatigue vs fitness',
  recovery: 'sleep guidelines, recovery windows, off-season structure, strength',
  psychology: 'mental tools, mantras, mindfulness, post-race blues prevention',
  cross_training_heat: 'cycling substitution for runners, heat acclimation',
  tissue_adaptation: 'tendon/bone/connective-tissue adaptation timelines, healing rates, physical stress theory, injury prevention',
  strength_training: 'strength for runners — frequency, key lifts, hip/core work, plyometrics, what to prescribe',
  trail_running: 'trail running benefits, proprioception, terrain strength, how to integrate safely',
  testing: 'FTP/VO2max field tests, FTP calculation, retest cadence, zone setup',
  race_day: 'marathon pacing, even vs negative split, no banking, pre-race nerves, process goals',
  return_to_running: 'return-to-run after injury — pain-free rule, time-not-distance, volume rebuild, RHR monitoring',
  female_athlete: 'RED-S / low energy availability, amenorrhea warning signs, bone-density risk — refer to doctor',
  downhill_running: 'eccentric loading, descent technique, impact forces, frequency and dosing',
  advanced_metrics: 'Normalized Power, Intensity Factor ranges, Variability Index, hrTSS vs TSS, aerobic decoupling thresholds (the app computes decoupling)',
  intensity_models: 'polarized vs pyramidal vs threshold, Seiler 3-zone model, which distribution to use',
  vdot_pacing: 'Daniels VDOT, E/M/T/I/R training paces by %VO2max, volume distribution by pace',
};

export const KNOWLEDGE_TOPICS: Record<KnowledgeTopic, string> = {
  thresholds_zones: `### Zones & Lactate Threshold
- Lactate threshold (LT) = intensity sustainable ~45–55 min in race conditions.
- Talk test: threshold = workload where comfortable conversation becomes impossible.
- Lab-comparable talk-test protocol: 10-min warmup → increment every 4 min → read a 30-word passage at end of each stage → last comfortable stage = threshold.
- Distribution (elite standard): 75–80% volume below LT (Z1–2); pyramidal/polarized; avoid continuous Z3.
- 6-zone HR model used by this app: Z1 recovery, Z2 easy aerobic, Z3 aerobic/tempo, Z4 threshold, Z5 VO2max, Z6 neuromuscular.

LT vs VO2max — trainability & priority:
- LT is HIGHLY trainable and the priority metric for distance runners; VO2max is much LESS trainable (strongly genetic, and gains often tied to body-weight change).
- VO2max is the ceiling — LT can't exceed it. Raising LT lets the athlete hold a higher % of VO2max for longer.
- LT as % of VO2max separates endurance ability: ~68% (less trained) vs ~82% (well trained). Closing that gap is where long-race gains come from.
- Train LT: 4–12 min intervals, short recovery (1–3 min), 30–60 min total; weekly OK; 48–72 h recovery (glycogen depleting).
- Train VO2max: 1–5 min intervals, equal/longer recovery, 10–20 min total time-in-zone; ~every 2 weeks; 36–48 h recovery.`,

  intervals: `### High-Intensity Interval Protocols
Norwegian threshold method:
- 2–3 threshold sessions/week; never two hard days back-to-back for non-elites.
- Break tempo into short intervals, minimal recovery: 10×1000m @LT w/ 60s rest, or 20×400m @LT w/ 30s rest.
- Each rep should feel manageable ("could run much faster"); challenge accumulates across the set.
- Everyday scaling: ~6×1000m or ~14×400m.

Rønnestad 30/15 (VO2max / aerobic power):
- 30s @ ~110% threshold power, 15s @ ~50% threshold (active recovery).
- Start 2–3 sets × 9 reps; progress reps/intensity. Warmup ≥2×1-min @110–120% threshold.
- Goal: maximize time at/above 90% VO2max → mitochondria, capillaries, lactate clearance.
- Long vs short VO2 intervals: traditional longer intervals (e.g. 4–5 min) accumulate MORE time above 90% VO2max than intensified very-short intervals — favor longer work intervals when the target is VO2max time-in-zone.

Fatigue resistance (durability):
- Ability to hold power/pace after ~1500 kJ / ~2.5 hr. Elite retain >91% of fresh peak; <85% below average.
- Fatigue-prime: 2–3 hr @65–75% FTP → 1-min sprint → 2–4 intervals @90–95% of that sprint.
- Hard-finish long run: 3–4 hr Z2 + 20–30 min threshold/sweet spot at end.
- Race sim: strong steady opening + chaotic final 30 min; OR back-to-back days.

Adaptation efficiency (modality tradeoffs):
- Mitochondrial gains are similar across endurance, HIIT, and sprint-interval training; sprint intervals reach comparable gains in the LEAST total time.
- VO2max improves similarly across modalities, with HIIT trending best.
- Bigger gains when training frequency is higher and starting fitness lower; adaptations plateau (esp. sprint-interval) → vary stimulus over a season.`,

  mileage_progression: `### Mileage Progression
Priority order for adding volume (safest → least safe):
1. Increase run frequency (toward 6×/week) — add 1 run at a time, start each at 2–3 miles.
2. Add a second long run (shorter than primary, with surges/progression).
3. Lengthen existing runs (worst risk-reward; spread across multiple cycles, not within one).

Rules:
- 80% of training time at low intensity (below ~78% max HR).
- Weekly total mileage predicts performance better than single long-run distance.
- Never increase all dimensions at once; sequence changes, recover between each.
- ≤10% weekly volume increase; recovery week every 3–4 weeks at ~85%.

Runner-specific load management (concrete):
- CTL +1–2/week optimal (3+ = strain; up to 5 in a camp). End-of-week TSB floor −30; newer runners −22 to −26.
- ATL: aerobic runs modulate 3–5 pts; a long run can add up to 25 pts late in cycle.
- Recovery week = 5–20% load cut via ONE variable (frequency OR duration OR intensity).
- Periodization: 3-week (2 on/1 down — suits female & masters) or 4-week (3 on/1 down).
- Same duration, different TSS: 80-min hard ≈ 100 TSS vs 80-min easy ≈ 40–70.

Time vs distance:
- Prefer training by TIME for: overuse-prone athletes, recovery runs, technical/hilly terrain, pace-obsessed athletes, technique blocks.
- Distance-based suits flat consistent terrain and athletes comfortable with mileage targets.`,

  marathon: `### Marathon
Minimum base: 40-mi weeks; ~1 hr/day running average.
Phase structure (16-week reference):
- Phase 1 (wk 1–8): base + intro speed. Build to 30–35 mi/wk over first 8 weeks. 70–80% Z2.
- Phase 2 (wk 8–16): intensity + mileage. 10K/HM/MP work, tempo, intervals, hills.
- Speedwork ≤20% of weekly volume (80/20 split).
- Taper: −20–25% volume, 7–14 days out; longest taper run 10–13 mi.

Long run: any run >2 hr OR >16 mi (whichever first). Comfortable 1 hr by wk 8 → build 18–20 mi → peak 20–22 mi at 4–6 wk before race.
Quality: 2–3 sessions per 7–10 days; space hard efforts 2–3 days apart.
Avoid events >15K during buildup unless used as training substitutes.
"No-man's land" warning: easy runs only 30–45 s/km slower than race pace = insufficient recovery stimulus.
Post-race: newer marathoners rest 7–10 days before resuming.

6 essential marathon workouts:
1. Intro intervals: 4–5×1200m @ HM–15K pace, 1–2 min jog recovery; early in cycle.
2. Steady-state intervals: 3–4×1–1.5 mi @ 10K–HM pace, 400m/2:30 recovery.
3. Economy: 16–20×400m or 12–16×600m or 8×800m progressive; needs neuromuscular base.
4. Continuous tempo: 4–7 mi / 25–45 min @ MP, no rest; avoid Z3.
5. Fartlek: 3–5 mi free-form 30s–2min; recovery-week quality.
6. Long-run intervals: e.g. 2 min MP / 2 min Z2 for 4 mi; tests nutrition.`,

  half_marathon: `### Half Marathon
- Always pass through a base phase before chasing a time barrier — most plateaus = skipped base.
- Train negative splits (faster 2nd half) on race-specific terrain.
- Fitness gains visible ~4 weeks; biggest gains 4–12 weeks of structured work.

Workout categories:
1. Diminished-recovery intervals: 5×(5min on/1min off), 8×(2:30 on/30–45s off) — short rest prevents over-threshold pace.
2. Progression runs 5–12 mi: MP → HM goal pace → 10K pace later in cycle.
3. Over-threshold intervals: 4–7×1mi or 2×(2mi,1mi,800m) @ 10mi–10K pace, minimal rest.
4. Specific endurance: 3×(2mi @ goal pace, 800m @ MP+30s) — well-rested; tests fueling.`,

  ultramarathon: `### Ultramarathon
- Build aerobic base ~6 months toward 15–20 hr/week; +5–10% weekly volume. Baseline: comfortable 3–4 hr run.
- Intensity introduced 3–4 months pre-race, only 2–3×/week (hills, threshold, tempo).
- Measure trail training by TIME not distance; terrain specificity critical.
- Advanced: back-to-back long-run days to simulate cumulative fatigue.
- Power-hiking technique (weighted vest practice) for steep terrain.
- Taper: −20–25% volume over 7–14 days.
- Trail pace ≠ road pace (8-min road mile can be 15 min on technical trail).
- Late-race fueling: savory/salty options (broth, chips, pickles) when sweet gels become intolerable.`,

  fueling_hydration: `### Race Fueling & Hydration
Carbohydrate:
- Glucose-only ceiling ~60g/hr (SGLT1 saturates). Fructose (GLUT5) unlocks more.
- General endurance 60–90g/hr; high-intensity/long 100–120g/hr.
- Glucose:fructose when >60g/hr: ~2:1 or 1:0.8 — higher oxidation, less GI distress.
- Caffeine ~0.3 mg/kg (typ. 150–250mg). Avoid slow-release carbs at high intensity.

Gut training:
- Start 6–10 wk pre-race; 1 dedicated session/week. From baseline, +10g/hr each week toward ~120g/hr.
- Pre-race meal: 1g carb/kg bodyweight 2–3 hr before (up to 3–4g/kg for extreme); low fat/protein.

Hydration & sodium:
- Sweat sodium ~1000 mg/L; replace ≥1000 mg during efforts; 1000–2000 mg per 20–30 oz water in high-sweat.
- Plain water alone can't offset sodium → hyponatremia (nausea, headache, confusion; severe: seizure/coma).
- Finish at ~2% bodyweight loss (≤2.5% ok for >4 hr).
- Hourly fluid = (duration × sweat rate − acceptable weight loss) ÷ duration.`,

  zone2_fat: `### Zone 2 — Metabolic Flexibility
- Zone 2 builds mitochondria → raises FTP/threshold; foundation of aerobic base.
- "Dimmer switch": pre-ride nutrition shifts fuel mix.
  - Fasted/low-carb Z2 (AM, depleted glycogen) → ~45–50% fat oxidation; trains fat-burning.
  - High-carb 2–4 hr before → ~75% carb / 25% fat; supports higher-intensity quality.
- Practical split: ~70–80% of Z2 volume carb-fueled, ~20–30% fat-focused (fasted/low-carb).

Carb periodization ("train low" — NOT a low-carb diet; restrict around specific sessions only):
- Train LOW (restrict carb) only for: easy/moderate sessions ≤60–90 min. Low glycogen amplifies fat-adaptation genes (AMPK → more mitochondria/oxidative enzymes).
- Train HIGH (carb-fueled) for: all high-intensity work, any session >90 min, and races. Train-low here hurts quality and adaptation.
- "Sleep low": carb-fueled hard session in evening → low-carb overnight fast → easy moderate session next morning fasted. Only works if the AM session stays EASY — fasted hard/long-moderate is detrimental.
- Mitigate train-low downsides: protein before (not fully fasted), caffeine ~20 min prior.
- Dosing on high days: pre-race day 8–10 g/kg high-GI carb; during race 60–90 g/hr (~20 g/20 min); post-session recovery 1.2 g/kg.
- Caution: chronic train-low → suppressed immunity, muscle breakdown, lost high-intensity capacity. Periodize, don't live there.`,

  taper_peak: `### Taper & Peak
- Begin taper 14–21 days before race; cut mileage, keep intensity.
- Shed fatigue faster than fitness declines → TSB moves from negative into +15 to +25 window.
- One poor night of sleep before race-day unlikely to ruin performance — focus on the 2 weeks prior.
- Excessively high TSB (>+25) = over-tapering; fitness eroding.`,

  recovery: `### Recovery, Sleep & Off-Season
Sleep:
- Consistent schedule > single long night before race.
- Gradually extend sleep 15–30 min/night over days/weeks before major events.
- Track subjective feel (refreshed, motivated) over device data; irritability = early deprivation signal.
- Body takes ~2 weeks to realize fitness gains — respect before evaluating adaptation.

Off-season (Matt Dixon framework — largest predictor of next year's breakthrough):
- Phase 1 (1–2 wk): complete mental + physical break after final race.
- Phase 2: ~30% lower volume than race season; keep weekly planning cadence.
- Strength: ≥2 sessions/week; progress bodyweight → external resistance; multi-plane stability.
- Consistency > intensity for long-term development.`,

  psychology: `### Sports Psychology
Mental performance tools:
- Journaling: emotions + training data post-workout → surfaces patterns and triggers.
- Personal mantras: short phrases ("strong and steady") to anchor focus in hard segments.
- Mindfulness/meditation: body scans, focused breathing → lowers stress hormones, speeds recovery.
- Present-moment focus: "flow state" trained through deliberate practice.

Post-race blues prevention:
- Build community around training, not just race outcome.
- Redefine success beyond finishing time — celebrate effort, growth, process.
- Schedule next goal before completing the current one — prevents identity collapse / emotional void.`,

  cross_training_heat: `### Cross-Training & Heat
Cycling for runners:
- Running stays primary; cycling supplements (impact-injury history, safe volume, extra intensity without ground force).
- Running ground-reaction force ≈ 3× bodyweight; cycling removes it → faster recovery (~1 day for Z2 ride).
- Cycling HR runs 8–10 bpm lower than running at same RPE for new cyclists — don't compare HR zones 1:1.
- Z2 ride 2–4 hr conversational. Muscle-tension intervals: 50–60 RPM heavy resistance, 5–10 min, RPE 6–8.
- VO2max: 3–6 min efforts (e.g. 7×3 min hard / 3 min easy), RPE 9–10.
- Sum load across ALL modalities to avoid hidden overtraining.

Heat acclimation:
- Adaptations: increased plasma volume, earlier/greater sweat, lower core temp + HR at given effort, reduced sodium loss.
- Method: controlled heat exposure (warm room, limited airflow, or extra layers).
- Monitor via pre/post bodyweight + core temp. Partial transfer to cool-weather performance.`,

  tissue_adaptation: `### Tissue Adaptation & Injury Prevention
- Connective tissue (tendons, ligaments) adapts SLOWER than muscle — lower blood supply. Aerobic fitness can outpace structural readiness → injury.
- Adaptation window when changing volume/mechanics/footwear: 6–12 weeks. Hold changes; don't jump ahead because you "feel good".
- 10% rule: increase weekly mileage ≤10%. Slow, steady load → proper connective-tissue development.
- Physical Stress Theory phases: atrophy → maintenance → hypertrophy → injury. Progress load toward hypertrophy/maintenance; overload pushes into injury zone.
- Soft-tissue healing timeline (when already injured): ~50% at 2 weeks, ~80% at 6 weeks, ~100% at 12 weeks. Tendon/ligament tears much harder to heal than muscle (may need surgery).
- Adaptation rate modulated by age, nutrition, sleep, injury type.
- Practical: after a layoff, footwear change, or surface change, rebuild gradually over 6+ weeks even if cardio feels easy.`,

  strength_training: `### Strength Training for Runners
- Frequency: 2–3 sessions/week, ~30 min each is enough to capture benefits.
- Goal: stable posture, strong hips, pelvis/torso mobility — force production + injury prevention, not bulk.
- 7 key compound lifts (endurance athletes): deadlift, Romanian deadlift, squat, box jump, bench press, pull-up, push press. Establish form with light load before heavy loading.
- High-volume lunges → muscular endurance; heavy unilateral load → strength + exposes left/right imbalances.
- Priority muscles: glutes/hips (RDLs, hip thrusts), quads (back squat — prevents patellar tendonitis / runner's knee), calves (control windlass mechanism), hamstrings (Nordic curls — as few as 8 effective reps/week supports hamstring health).
- Hip abductors are key frontal-plane stabilizers; weakness → knee/back compensation injuries.
- Hip-strength circuit (3×8/side typical): hip abduction, monster walks, quadruped, split squats, knee drive with band, heel drop + hip hike (IT-band pain).
- Plyometrics: keep ground-contact time ≤250 ms for elastic/reactive benefit.
- Season periodization: build strength in off-season (heavier), maintain (lower volume) in race phase.
- Foot/ankle (builds buffer vs overuse injury; most are daily or 3–5×/week):
  - Short foot (daily, neurological focus) → foot control, less calf compensation; prevents plantar fasciitis/metatarsalgia.
  - Calf raises/heel drops with toes elevated → intrinsic foot; prevents Achilles tendinitis, calf strain.
  - Banded big-toe raise (daily) → big toe transmits most ground force; prevents plantar fasciitis.
  - Knee-to-wall → anterior shin; prevents shin splints. Eversion/inversion calf raises → prevents peroneal tendonitis.
  - Single-leg stance (up to 5 min/foot), storks, toe taps → balance, ankle stability, proprioception.`,

  trail_running: `### Trail Running
- Benefits: improves precision foot placement, balance, agility, proprioception — transfers to road running under fatigue.
- Strengthens stabilizers (glutes, calves, ankle) + connective tissue; softer surface than asphalt reduces impact.
- Elevation/terrain create natural interval stimulus → lowers average HR on roads over time.
- Mental: forces present-moment focus; nature exposure aids recovery/mood.
- Integration: start short & easy; trail-appropriate footwear; don't expect road-pace equivalence (measure by time/effort, not pace); plan for weather, daylight, safety.`,

  testing: `### Field Testing (FTP / VO2max)
- FTP estimate = 95% of average power from a 20-min maximal test.
- Two-day protocol: Day 1 — warmup + 2×10s sprints + 1-min max effort. Day 2 — warmup + 5-min max (VO2max proxy) + 15-min easy + 20-min max (FTP test). Slight hill/climb preferred.
- Retest every 4–6 weeks; track trend.
- Zone setup: derive zones from threshold (FTP or LTHR). Coggan 6-zone model for power; this app uses a 6-zone HR model.
- Running analogue: use a ~20–30 min time trial or recent race to estimate threshold pace/HR; talk test as a no-equipment fallback (see thresholds_zones).`,

  race_day: `### Race Day — Pacing & Mindset
Pacing:
- Even pace is best for most marathoners; negative split (slightly slower 1st half) is the strong alternative.
- DON'T "bank time" by going out fast — late-race losses exceed early gains.
- Avoid complex mid-race pace adjustments unless very experienced; use terrain-aware pace targets.
- "Race how you train" — rehearse goal pace and negative splits via progression runs in training.

Pre-race nerves:
- Reframe as challenge (you have the resources) not threat → better nervous-system response.
- 3 goal types: outcome (placing), performance (time), process (technique/fueling actions). Focus on PROCESS goals during the race.
- "What-if" plan (~1 month out): list fears → prevention → response; visualize handling each.
- Positive self-talk lowers cortisol → protects power output and decision-making.
- Confidence recall: keep a list of past training/racing wins to reference mid-race.`,

  return_to_running: `### Return to Running (post-injury/illness/fatigue)
- Golden rule: pain-free movement before intensity. Stay at easy/recovery pace until NO joint/muscle/tendon pain; lower-body injuries often need 3–6 weeks at low intensity first.
- Measure by TIME not distance — avoids demoralizing comparison to past fitness; expect slower & shorter.
- Rebuild structure (Higdon): return to the program week where you stopped, halve that week's mileage, repeat the week at full mileage, then continue.
- Volume: build incrementally with recovery days between harder efforts; step back when overtired.
- Monitor resting HR + fatigue daily; if elevated/overtired, swap in recovery run or rest.
- Concussion/head: only resume when asymptomatic; progress only if no symptoms in the 24 h after a session; stop if symptoms return.
- Set a dream goal + flexible interim targets; avoid rigid timelines early.`,

  female_athlete: `### Female Athlete Health (RED-S / Low Energy Availability)
- Exercise-associated amenorrhea: loss of period ≥3 months (regular cycles) or ≥6 months (irregular). Affects ~3–4% of female athletes.
- Cause: energy intake doesn't meet demand (often from chasing race weight) → hypothalamic hormone changes → low estrogen.
- Risks: reduced bone density, higher stress-fracture risk; some bone-density loss may be PERMANENT.
- A missing period is ALWAYS a reason for concern — not a normal training adaptation.
- Coaching response: flag low-energy-availability risk, do NOT push further weight loss, encourage increased caloric intake, and refer to a doctor + sports nutritionist. Recovery typically 3–12 months after intervention. This is a medical issue — the coach surfaces concern and defers to professionals, never diagnoses.`,

  downhill_running: `### Downhill Running (eccentric loading)
- Impact forces rise sharply downhill: ~+54% landing force and +73% braking force on a −9° slope → high overuse-injury and DOMS risk. Progress carefully.
- Eccentric loading causes muscle damage that can impair following sessions — under-dose early.
- Technique: higher cadence, shorter/quicker steps, mid-to-forefoot landing, lean to stay perpendicular to slope, "run quietly" (less noise = lower impact).
- Frequency: dedicated downhill work only ~once every 2 weeks for recovery.
- Session: after warmup, progressive descents (20/40/60/80/100/120 s) on technical terrain, walk-back recovery, technique over speed.
- Race-specific dosing: match descent proportionally — e.g. 8000 ft descent over 26 mi → ~3000–3100 ft descent in 10-mile training runs.
- Tactical: in ultras, descent speed declines continuously through the race — trained descending is a differentiator.`,

  advanced_metrics: `### Advanced Metrics (NP, IF, VI, decoupling)
- Normalized Power (NP): adjusts average power for variability — estimates the physiological cost of a fluctuating effort. For steady efforts NP ≈ average; for variable efforts NP > average. Feeds TSS/load.
- Intensity Factor (IF) = NP ÷ threshold (1.0 = threshold). Typical ranges by session: recovery <0.75, endurance 0.75–0.85, tempo 0.85–0.95, threshold 0.95–1.05, VO2max/anaerobic >1.05.
- Variability Index (VI) = NP ÷ average power. ~1.0 = very steady (good for TT/threshold pacing); high VI = surgy/stochastic effort.
- hrTSS vs TSS: hrTSS derives load from heart rate when power/pace is absent — lags fast efforts (HR is slow to respond), so it underrates short intervals vs pace/power TSS. Prefer pace/power TSS when available.
- Aerobic decoupling (Pa:HR / Pw:HR): compares HR drift between 1st and 2nd half of a steady effort. <5% = strong aerobic endurance at that intensity; 5–10% = moderate limitation; >10% = effort too hard OR insufficient base.
  - Use: track decoupling at fixed intensity over time — falling % = improving aerobic fitness. Low decoupling at target duration → ready to extend length/intensity. Persistently high → more base needed before progressing. (This app computes decoupling per long/steady activity — interpret it with these bands.)`,

  intensity_models: `### Intensity Distribution Models
3-zone framework (note: distinct from the app's 6-zone HR model): Z1 below first threshold (easy), Z2 between thresholds ("grey zone"), Z3 above second threshold (hard).
- Polarized (Seiler): ~75–80% Z1, ~5% Z2, ~15–20% Z3. Most volume easy + meaningful hard work, little time in the middle. Strong for athletes with limited hours and for speed development; research shows large gains in key endurance variables.
- Pyramidal: most Z1, moderate Z2, least Z3 — descending across zones. Suits competitive/elite athletes with deep aerobic base; what well-trained athletes often adopt naturally.
- Threshold model: heavy concentration in Z2 / at-threshold. Higher fatigue cost; usually inferior to polarized for key adaptations.
- Practical: many athletes do best transitioning pyramidal (base) → polarized (sharpening). Either way, keep the bulk easy (80/20 core rule).`,

  vdot_pacing: `### VDOT & Training Paces (Jack Daniels)
- VDOT = a fitness index from a recent race time (functional VO2max proxy); higher VDOT → faster prescribed paces. e.g. 10K in 45:00 ≈ VDOT ~44.
- Five pace types by purpose (% VO2max):
  - Easy (E): 65–78% — aerobic base + recovery.
  - Marathon (M): 80–84% — marathon-specific endurance.
  - Threshold/Tempo (T): 88–92% — lactate clearance / threshold.
  - Interval (I): 95–100% — VO2max development.
  - Repetition (R): >100% — speed + running economy.
- Volume distribution: ~70–80% Easy, ~10–15% M+T, ~10–15% I+R.
- Use: get VDOT from a recent race/time-trial → assign each workout a pace by its physiological purpose rather than guessing. Re-estimate VDOT as fitness changes.`,
};

/** Look up one topic's content. Returns null for unknown keys. */
export function getKnowledgeTopic(topic: string): string | null {
  return (KNOWLEDGE_TOPICS as Record<string, string>)[topic] ?? null;
}
