---
name: Runiqlo
description: Personal running dashboard and AI coaching tool for the obsessive athlete.
colors:
  brand: "#fc4c02"
  accent-blue: "#0a84ff"
  accent-green: "#30d158"
  accent-yellow: "#ffd60a"
  accent-orange: "#ff9f0a"
  accent-red: "#ff453a"
  accent-purple: "#bf5af2"
  accent-cyan: "#64d2ff"
  base: "#09090c"
  surface-0: "#101013"
  surface-1: "#17171b"
  surface-2: "#1e1e23"
  text-1: "#efeff3"
  text-2: "#888896"
  text-3: "#404050"
  border: "rgba(255,255,255,0.05)"
  edge: "rgba(255,255,255,0.07)"
typography:
  display:
    fontFamily: "Geist, system-ui, -apple-system, SF Pro Display, sans-serif"
    fontSize: "clamp(3.5rem, 6vw, 6rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Geist, system-ui, -apple-system, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, system-ui, -apple-system, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.1em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
rounded:
  badge: "6px"
  inner: "10px"
  card: "14px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.inner}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "#e04400"
    textColor: "{colors.text-1}"
  button-ghost:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.inner}"
    padding: "8px 12px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-1}"
  card-surface:
    backgroundColor: "{colors.surface-0}"
    textColor: "{colors.text-1}"
    rounded: "{rounded.card}"
  workout-chip-easy:
    backgroundColor: "rgba(48,209,88,0.08)"
    textColor: "{colors.accent-green}"
    rounded: "{rounded.inner}"
    padding: "6px 12px"
  workout-chip-tempo:
    backgroundColor: "rgba(255,214,10,0.08)"
    textColor: "{colors.accent-yellow}"
    rounded: "{rounded.inner}"
    padding: "6px 12px"
  workout-chip-interval:
    backgroundColor: "rgba(255,69,58,0.08)"
    textColor: "{colors.accent-red}"
    rounded: "{rounded.inner}"
    padding: "6px 12px"
---

# Design System: Runiqlo

## 1. Overview

**Creative North Star: "The Dark Lab"**

Runiqlo is a physiologist's analysis tool, not a fitness app. The interface inherits from sports science workstations and terminal data readers: near-black surfaces with precise numerical readouts, where color serves as signal — zone indicators, effort calibration, trend status — never as decoration. The UI disappears; the data speaks.

The system rejects fitness-app clichés completely: no streak badges, no motivational gradients, no orange-and-blue activity feeds. It rejects generic SaaS equally: no sidebar-nav card grids, no hero metrics with purple gradients. This is a precision instrument. Every element visible on screen must directly inform a training decision.

Dark is not a theme choice — it is the product's identity. The athlete uses this at 6am before a run and at 9pm reviewing a session. The ambient light around this app is low; the surfaces reflect it accordingly.

**Key Characteristics:**
- Near-black base (`#09090c`) with four ascending surface tones, no mid-grays
- Color is semantic only: effort zones, sport types, training status — never decoration
- Strava orange (`#fc4c02`) as the sole accent; used for active states and primary actions, nowhere else
- Single typeface (Geist) across all sizes — hierarchy through weight and scale, not family switching
- Tabular-nums throughout all metric displays — alignment is precision
- No shadows to speak of; depth from surface steps, not blur

## 2. Colors: The Lab Palette

Monochromatic foundation with strictly semantic accent vocabulary. Color communicates training intensity and system state; nothing else.

### Primary
- **Strava Orange** (`#fc4c02`): Brand accent. Active nav, primary CTAs, today's training highlight. Used on ≤5% of any screen — its rarity is the signal.

### Secondary
- **Zone Green** (`#30d158`): Easy effort, Zone 1–2, recovery runs, long runs. Also: success states.
- **Zone Yellow** (`#ffd60a`): Tempo effort, Zone 3. Also: warning states.
- **Zone Red** (`#ff453a`): High-intensity effort, Zones 4–5. Also: error/danger states.
- **Zone Orange** (`#ff9f0a`): Gym, cross-training, threshold. Zone 4–5 adjacent.
- **Zone Blue** (`#0a84ff`): Cycling, aerobic zone indicators. Also: informational states.
- **Zone Purple** (`#bf5af2`): VO2max, anaerobic, yoga. Also: secondary informational.
- **Zone Cyan** (`#64d2ff`): Recovery runs, swim, cross-training, cooldown steps.

### Neutral
- **Void** (`#09090c`): App base background. The resting state.
- **Surface Card** (`#101013`): Primary card and panel background.
- **Surface Raised** (`#17171b`): Hovered cards, selected states, inner elements.
- **Surface High** (`#1e1e23`): Deepest nested surface — tooltips, overlays.
- **Text Primary** (`#efeff3`): Headlines, key values, actionable labels.
- **Text Secondary** (`#888896`): Supporting text, units, metadata.
- **Text Tertiary** (`#404050`): Placeholder text, disabled labels, dividers.
- **Border** (`rgba(255,255,255,0.05)`): Card edges, separator lines.
- **Edge** (`rgba(255,255,255,0.07)`): Inset highlights, top-edge of cards.

### Named Rules
**The One Signal Rule.** Zone colors are the color vocabulary. Each maps to a specific training intensity. Never reassign a zone color to a non-training use case — if green means Easy Run, it cannot also mean "feature enabled" or "popular plan".

**The Rarity Rule.** Strava orange appears once per screen at most. When everything is orange, nothing is urgent.

## 3. Typography

**Display Font:** Geist (with system-ui, -apple-system, SF Pro Display, sans-serif fallback)
**Body Font:** Same — Geist carries the full hierarchy
**Mono Font:** Geist Mono (with ui-monospace, SF Mono, monospace fallback)

**Character:** One family, one trust. Geist's clean geometry handles both display numbers at 6rem and 10px labels without awkwardness. Switching families for "visual interest" would break the instrument-panel uniformity. Weight contrast (400 → 800) does the hierarchy work.

### Hierarchy
- **Display** (800, clamp 3.5rem–6rem, line-height 1, -0.04em): TSB hero number, CTL/ATL readout on dashboard. Used once per page, never repeated.
- **Headline** (600, 1.125rem, line-height 1.3, -0.01em): Card titles, section labels, page headings.
- **Body** (400, 0.875rem, line-height 1.5): Coach messages, workout descriptions, activity notes. Max 65ch.
- **Label** (600, 0.6875rem, letter-spacing 0.1em, uppercase): Metric unit labels, section eyebrows (used sparingly — never as section scaffolding). Badge text.
- **Mono** (Geist Mono, 400, 0.875rem): Pace values, HR readings, duration, all tabular data. `font-variant-numeric: tabular-nums` always on.

### Named Rules
**The Mono Data Rule.** Every numeric metric — pace, HR, distance, duration, percentage — uses `font-variant-numeric: tabular-nums` and Geist Mono when column alignment is needed. Proportional numerals in data are misalignment waiting to happen.

**The No-Scale-Clamp Rule.** Body text and labels use fixed rem, never fluid clamp. This is product UI viewed at a consistent DPI; fluid typography creates jank in sidepanels and card grids.

## 4. Elevation

Runiqlo is flat by default and uses tonal layering — ascending surface colors — to convey depth. Shadows exist but are structural, not decorative.

### Shadow Vocabulary
- **Base** (`0 1px 3px rgba(0,0,0,0.6)`): Cards at rest. Used on `.surface-card`. Ambient anchoring, not lift.
- **Elevated** (`0 4px 20px rgba(0,0,0,0.7)`): Legacy bento glassmorphic cards. Heavier ambient for blur-backed elements.
- **Inset Edge** (`0 1px 0 0 rgba(255,255,255,0.07) inset`): Top-edge highlight on all `.surface-card` and `.bento-card`. Creates the slight "LED rim" effect that reads as premium in dark UIs.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. The four surface tones (`base → surface-0 → surface-1 → surface-2`) create hierarchy through color, not shadow. Shadows appear only as ambient anchoring (`shadow-base`) and never as a decorative lift effect.

**The No-Glassmorphism-Default Rule.** Backdrop blur is legacy (`.bento-card-stage`). New components use solid surface colors. Blur is expensive on GPU, inconsistent on iOS, and decorative — all three banned.

## 5. Components

### Buttons
The sport computer operator touch. Solid, compact, confident.
- **Shape:** Gently curved (10px radius — `--radius-inner`)
- **Primary:** Strava orange fill (`#fc4c02`) + primary text. Padding 8px 16px. No shadow. Pressed: darken to `#e04400`, scale `0.98`.
- **Ghost:** `surface-1` background, secondary text. Hover: `surface-2` background, primary text. Used for all secondary actions (export, subscribe, nav arrows).
- **Icon-only:** 28px × 28px (desktop), 40px × 40px (mobile touch target). Same ghost treatment. Square with 8px radius.
- **Destructive:** Same shape as primary but uses `accent-red/20` background with `accent-red` text. Never a full red fill.

### Workout Chips (Signature Component)
Color-coded training type badges. The most-repeated component in the app.
- **Shape:** Rounded (10px radius). Compact — padding 6px 12px.
- **Color:** Always the zone color at 8% opacity for background, 100% for text and border.
- **States:** Default = labeled pill. Selected = `ring-2 ring-white/30`. Completed = `opacity-80` + green checkmark.
- **Uppercase label:** Short type label in small uppercase with wide tracking (inherits `.label` style).

### Cards / Containers
- **Corner Style:** 14px (`--radius-card`), consistent on all cards.
- **Background:** `surface-0` (`#101013`) with 1px `border` at `rgba(255,255,255,0.05)`.
- **Inset Edge:** Always `box-shadow: 0 1px 0 0 rgba(255,255,255,0.07) inset` — the single-pixel light rim is non-negotiable on dark surfaces.
- **Hover:** Background steps up to `surface-1`. Border shifts to `rgba(255,255,255,0.08)`. No shadow added on hover.
- **Internal Padding:** 20px (`p-5`) standard. 16px (`p-4`) compact.
- **Nesting:** `.surface-raised` (10px, `surface-1`) for inner elements within cards. Never a card inside a card.

### Inputs / Fields
- **Style:** `surface-1` background, `border` at `rgba(255,255,255,0.07)`, 8–10px radius.
- **Focus:** Border steps to `accent/50`, no glow, no shadow. Clean.
- **Placeholder:** `text-white/25` — at the minimum contrast threshold. Do not go lower.
- **Mono input:** For activity IDs, numeric fields — switches to Geist Mono.

### Navigation
- **Desktop:** Top horizontal bar. Geist Medium 14px. Active: Strava orange underline (2px, `border-b-2`). Hover: `text-white/70`. Icon + label always.
- **Mobile:** Fixed bottom nav (`InteractiveMenu`). Same orange accent underline, animated opacity transition. Touch target minimum 44px height. Label `font-size: 10px`, capitalize.
- **Active indicator:** Animated opacity (CSS `opacity: 0 → 1`) on `::after` pseudo-element, width matches text label (set by JS). No layout-animating `width` transition.

### Zone Step Rows (Signature Component)
Workout timeline steps (warmup / training / rest / cooldown).
- **Indicator:** Small 6px dot in zone color, left-aligned before label. No side-border stripe.
- **Background:** `color-mix(in srgb, zone-color 8%, transparent)` tint. Rounded all sides (10px).
- **Label:** Zone color at 100%, 10px uppercase with wide tracking.
- **Repeat blocks:** Outer border + `surface-0` background, no side stripe on inner steps, `×N` badge top-right.

## 6. Do's and Don'ts

### Do:
- **Do** use tabular-nums and Geist Mono for every pace, HR, duration, and percentage value.
- **Do** use zone colors as the sole semantic color vocabulary — green = easy, yellow = tempo, red = intensity, etc.
- **Do** use `--radius-card` (14px) on all cards and `--radius-inner` (10px) on all inner chips, inputs, and buttons.
- **Do** step surface colors up one level (`surface-0 → surface-1`) for hover states — never add a shadow on hover.
- **Do** include the `box-shadow: 0 1px 0 0 rgba(255,255,255,0.07) inset` edge highlight on every `.surface-card`.
- **Do** use Strava orange exclusively for active nav, primary CTA, and today's workout highlight — nowhere else.
- **Do** respect `@media (prefers-reduced-motion: reduce)` on all transitions.

### Don't:
- **Don't** add `border-left` or `border-right` greater than 1px as a colored stripe on cards, callouts, or list items. The side-stripe is an AI cliché. Use background tints and dot indicators instead.
- **Don't** use gradient text (`background-clip: text`). Single solid color only.
- **Don't** use glassmorphism (backdrop-blur) on new components. Legacy `.bento-card-stage` exists; do not extend the pattern.
- **Don't** add shadows on hover. This system uses tonal layering for depth — shadow is not a hover signal.
- **Don't** build a generic SaaS dashboard: no purple gradients, no card-grid hero metrics, no identical-card layouts.
- **Don't** use fitness-influencer aesthetics: no streaks UI, no bright motivational color palettes, no badge gamification patterns.
- **Don't** build Garmin Connect: no feature-bloat layouts, no cluttered everything-everywhere screens.
- **Don't** replicate Strava's blue/orange activity feed card grid — it's the explicit anti-reference.
- **Don't** use `transition: width` or any CSS layout-property animation. Use `transform`, `opacity`, or `clip-path`.
- **Don't** use font-family mixing for hierarchy. One family (Geist), weight contrast only.
- **Don't** put color-coded zone information in any non-zone context — zone green cannot become a generic "success" green if it conflicts with existing zone semantics.
