# Product

## Register

product

## Users

Single athlete (personal tool). A data-obsessed recreational/competitive runner who trains seriously, tracks every metric, and wants coaching without noise. Uses it daily: quick morning check of today's workout, post-run review, weekly planning via AI coach.

## Product Purpose

Personal training dashboard that pulls Strava activity data and overlays AI coaching. Surfaces fitness metrics (CTL/ATL/TSB), zone breakdowns, training load, and a structured weekly plan — all in one place. Success: athlete opens the app and knows exactly what to do, why, and how last session went, with zero friction.

## Brand Personality

Precise · Instrumental · Dark · Technical · Calm. The feel of a precision instrument on true-black glass: matte graphite panels floating on a black canvas, tabular mono numerals, one tunable signal accent (lime by default) glowing where it matters. An Apple-grade dark cockpit readout that happens to know your CTL. No motivational fluff, no badge gamification. Data is the signal; the chrome is quiet carbon and recedes into black.

## Anti-references

- Generic SaaS dashboard (purple gradients, glowing metric-card grids, identical hero numbers)
- Fitness influencer apps (streaks, bright motivational palettes, hype copy)
- Feature-bloated sports apps (Garmin Connect-style everything-everywhere)
- Strava's blue activity feed card grid pattern
- Flat "dark mode by inverting" — washed grey-on-grey with no real black canvas or elevation

## Design Principles

1. **Data earns its place** — every metric shown must be actionable; remove what informs but doesn't direct.
2. **Instrument, not poster** — true-black canvas, elevated graphite panels with rounded corners and soft depth; the screen reads like a precision readout, not a printed page.
3. **Precision over decoration** — prefer exact numbers and clean typography over ornament; every number is a tabular mono numeral (IBM Plex Mono).
4. **One tunable signal** — a single accent (lime default; amber/cyan/coral selectable) is rationed to the one thing that matters now. Everything else is graphite and text.
5. **System not surface** — design tokens over one-off styles; consistency is trustworthiness.
6. **Coach speaks plainly** — AI copy is direct and specific, never motivational or hedged.

## Accessibility & Inclusion

Single-user personal tool; WCAG AA as baseline. Dark by default (Apple-dark: `#f5f5f7` text on true-black `#000`), with a light theme toggle (Apple system-grouped: near-black text on `#f2f2f7`); body text ≥4.5:1 in both themes. Keyboard focus shows a 2px accent ring. Reduced motion respected for animations (`prefers-reduced-motion`). Mobile-first (used pre/post run on phone), touch targets ≥44px.
