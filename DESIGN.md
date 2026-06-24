---
name: Runiqlo — Carbon Instrument
description: A precision training instrument. Personal dashboard on a true-black canvas with elevated graphite panels and one tunable signal accent.
theme: dark-default with light toggle (Apple dual, via [data-theme])
colors:
  # canvas
  bg: "#000000"
  bg-2: "#0a0a0c"
  # elevated graphite panels
  panel: "#151517"
  panel-2: "#1e1e22"
  panel-3: "#2a2a2f"
  # hairlines (alpha-white on dark)
  line: "rgba(255,255,255,0.07)"
  line-2: "rgba(255,255,255,0.11)"
  line-3: "rgba(255,255,255,0.18)"
  # text
  text: "#f5f5f7"
  dim: "rgba(235,235,245,0.62)"
  faint: "rgba(235,235,245,0.32)"
  faintest: "rgba(235,235,245,0.18)"
  # signal accent — runtime-tweakable (lime default)
  accent: "#c6f833"
  accent-2: "#a6d420"
  accent-ink: "#0a0d11"
  accent-glow: "rgba(198,248,51,0.20)"
  # form / TSB diverging
  fresh: "#30d158"
  neutral: "#ffd60a"
  fatigue: "#ff453a"
  # HR zones (Apple system palette)
  z1: "#8e8e93"
  z2: "#0a84ff"
  z3: "#30d158"
  z4: "#ffd60a"
  z5: "#ff9f0a"
  z6: "#ff453a"
accentPresets:
  lime:  { accent: "#c6f833", accent-2: "#a6d420", glow: "rgba(198,248,51,0.20)", ink: "#0a0d11" }
  amber: { accent: "#f2a33c", accent-2: "#d9871f", glow: "rgba(242,163,60,0.20)", ink: "#0a0d11" }
  cyan:  { accent: "#3fd6e0", accent-2: "#1fb4be", glow: "rgba(63,214,224,0.20)", ink: "#06181a" }
  coral: { accent: "#ff6b5a", accent-2: "#e64c3b", glow: "rgba(255,107,90,0.20)", ink: "#1a0a08" }
themeLight:
  bg: "#f2f2f7"
  bg-2: "#e8e8ed"
  panel: "#ffffff"
  panel-2: "#f5f5f7"
  panel-3: "#ebebf0"
  line: "rgba(0,0,0,0.07)"
  line-2: "rgba(0,0,0,0.11)"
  line-3: "rgba(0,0,0,0.18)"
  text: "#1c1c1e"
  dim: "rgba(60,60,67,0.62)"
  faint: "rgba(60,60,67,0.42)"
  fresh: "#28a745"
  neutral: "#e6a100"
  fatigue: "#ff3b30"
  z2: "#007aff"
  z3: "#28a745"
  z4: "#e6a100"
  z5: "#ff9500"
  z6: "#ff3b30"
typography:
  display:
    fontFamily: "Space Grotesk, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "clamp(3.5rem, 6vw, 6rem)"
    fontWeight: 600
    lineHeight: 0.96
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "27px"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  deck:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "9.5px"
    fontWeight: 600
    letterSpacing: "0.07em"
    textTransform: uppercase
  num:
    fontFamily: "IBM Plex Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "36px"
    fontWeight: 600
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
rounded:
  card: "18px"
  inner: "12px"
  badge: "980px"
  pill: "980px"
  button: "11px"
spacing:
  xs: "4px"
  sm: "8px"
  gap: "14px"
  pad: "18px"
  lg: "24px"
  xl: "32px"
elevation:
  panel: "0 1px 0 rgba(255,255,255,0.04) inset, 0 10px 30px -16px rgba(0,0,0,0.7)"
  panel-light: "0 1px 0 rgba(0,0,0,0.02) inset, 0 8px 24px -16px rgba(0,0,0,0.22)"
  button-accent: "0 4px 16px -6px var(--accent-glow)"
components:
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.button}"
    padding: "9px 16px"
    fontWeight: 650
    boxShadow: "{elevation.button-accent}"
  button-accent-hover:
    backgroundColor: "{colors.accent-2}"
    textColor: "{colors.accent-ink}"
  button-default:
    backgroundColor: "rgba(255,255,255,0.08)"
    textColor: "{colors.text}"
    rounded: "{rounded.button}"
    padding: "9px 16px"
    fontWeight: 590
  button-default-hover:
    backgroundColor: "rgba(255,255,255,0.13)"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.dim}"
    rounded: "{rounded.button}"
    padding: "9px 16px"
  button-ghost-hover:
    backgroundColor: "rgba(255,255,255,0.07)"
    textColor: "{colors.text}"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    border: "1px solid {colors.line}"
    rounded: "{rounded.card}"
    boxShadow: "{elevation.panel}"
  surface-raised:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.text}"
    border: "1px solid {colors.line}"
    rounded: "{rounded.card}"
  field:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.text}"
    border: "1px solid {colors.line-2}"
    rounded: "{rounded.inner}"
    padding: "10px 12px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.dim}"
    border: "1px solid {colors.line-2}"
    rounded: "{rounded.badge}"
    padding: "4px 9px"
  chip-ink:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    border: "1px solid {colors.accent}"
    rounded: "{rounded.badge}"
    padding: "4px 9px"
  tile:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    border: "1px solid {colors.line}"
    rounded: "{rounded.card}"
    padding: "14px 16px 16px"
  pill:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.dim}"
    rounded: "{rounded.pill}"
    padding: "3px 8px"
---

# Design System: Runiqlo — Carbon Instrument

## 1. Overview

**Creative North Star: "The Precision Instrument"**

Runiqlo is a precision training instrument for a single athlete, not an app skin. The interface is a true-black canvas with matte graphite panels floating on it: rounded 18px corners, hairline edges, a soft drop shadow that lifts each panel off the black, tabular mono numerals, and one tunable signal accent (lime by default) reserved for what matters now. It reads like an Apple-grade dark cockpit readout that happens to know your CTL. The chrome is quiet carbon; the data is the signal.

It rejects every fitness-app and SaaS-dashboard reflex. No purple gradients, no glowing metric-card grids, no streak badges or motivational copy, no Strava blue feed. It also rejects the lazy "dark mode by inversion": this is a real black canvas (`#000`) with genuinely elevated panels, not washed grey-on-grey. The accent is rationed and tunable — swap lime for amber, cyan, or coral at runtime — but only ever one signal per screen.

The athlete reads this in any light, day or night: on a phone after a run, at a desk while planning a week. Dark is the default; a light theme toggle (Apple system-grouped — white panels on `#f2f2f7`) covers bright daylight. Density is instrumental: a status rail, a panel of headline tiles, a ledger of efforts, a coach margin note.

**Key Characteristics:**
- True-black canvas (`#000000`), with elevated graphite panels (`#151517` → `#1e1e22` → `#2a2a2f`)
- 18px rounded panels (12px inner) with 1px hairline edges and a soft lifting shadow
- One tunable signal accent — lime `#c6f833` default, with amber / cyan / coral presets; rationed to one per screen
- Two typefaces, two jobs: Space Grotesk (display, headlines, body, labels, UI) and IBM Plex Mono (every numeral)
- Tabular mono numerals throughout — every metric reads like an instrument readout
- Apple dual theme: dark by default, light toggle via `[data-theme="light"]`

## 2. Colors: The Carbon Palette

A true-black-and-graphite palette with one tunable signal accent. Color is black and graphite first; the accent and the Apple-system zone hues are the only saturation, and each carries meaning. All hues exposed as CSS variables in `src/app/globals.css`; the accent presets live in `ACCENTS` in `src/lib/activityModel.ts`.

### Signal Accent (tunable)
- **Accent** (`#c6f833`, lime default): The single signal. Primary CTA, active nav indicator, today's workout highlight, live dot, peak-phase marker, hero glow, sparkline stroke. Rationed; its rarity is the signal. **Accent-2** (`#a6d420`) is the pressed/hover state. **Accent-ink** (`#0a0d11`) is the text color *on* a filled accent surface. **Accent-glow** (`rgba(198,248,51,0.20)`) drives soft glows, selection, and focus tint.
- **Presets** (runtime-swappable via `ACCENTS`): **lime** `#c6f833`, **amber** `#f2a33c`, **cyan** `#3fd6e0`, **coral** `#ff6b5a`. Each ships its own accent-2, glow, and ink. The whole UI re-tints from these CSS vars — never hardcode the lime hex in a component.

### Form / TSB Diverging
The training-balance scale, used for TSB and freshness indicators.
- **Fresh** (`#30d158`): Positive TSB, recovered, ready. Success states.
- **Neutral** (`#ffd60a`): Balanced / caution band. Warning states.
- **Fatigue** (`#ff453a`): Negative TSB, fatigued, hard. Danger states.

### HR Zones (Apple system palette)
Each zone maps to exactly one training intensity; mirrored in `ZONE_COLORS` (`src/lib/activityModel.ts`).
- **Z1** (`#8e8e93`, grey): Recovery.
- **Z2** (`#0a84ff`, blue): Aerobic.
- **Z3** (`#30d158`, green): Tempo.
- **Z4** (`#ffd60a`, yellow): Threshold.
- **Z5** (`#ff9f0a`, orange): VO2max.
- **Z6** (`#ff453a`, red): Anaerobic.

### Neutral — Canvas, Panels & Text
- **Bg** (`#000000`): App canvas. True black. **Bg-2** (`#0a0a0c`): mobile-menu / recessed chrome.
- **Panel** (`#151517`): Primary elevated card surface. **Panel-2** (`#1e1e22`): raised/recessed inner blocks, hover fill. **Panel-3** (`#2a2a2f`): deepest graphite; nested recesses, pressed `.btn.ink`.
- **Text** (`#f5f5f7`): Headlines, key values. **Dim** (`rgba(235,235,245,0.62)`): supporting text, decks, metadata. **Faint** (`0.32`): labels, captions. **Faintest** (`0.18`): disabled / lowest emphasis.
- **Line** (`rgba(255,255,255,0.07)`): default hairline border. **Line-2** (`0.11`): chips, fields, slightly stronger dividers. **Line-3** (`0.18`): strongest hairline, hover edges, scrollbar hover.

### Light Theme (`[data-theme="light"]`)
Apple system-grouped: **Bg** `#f2f2f7`, **Panel** `#ffffff`, **Panel-2** `#f5f5f7`, **Panel-3** `#ebebf0`; **Text** `#1c1c1e`, **Dim** `rgba(60,60,67,0.62)`; hairlines flip to alpha-black (`rgba(0,0,0,0.07/0.11/0.18)`). Form and zone hues shift to light-surface variants (e.g. Z2 `#007aff`, Fresh `#28a745`). The accent is unchanged across themes.

### Named Rules
**The Single-Signal Rule.** The accent appears once, maybe twice, per screen. It marks the one thing that matters now: the primary action, today's workout, the live/peak metric. A screen where three things glow accent has nothing urgent.

**The Tunable-Accent Rule.** The accent is a runtime token, not a fixed brand color. Always reference `var(--accent)` / `var(--accent-2)` / `var(--accent-glow)` / `var(--accent-ink)` — never a literal `#c6f833`. Swapping the preset must re-tint the entire UI.

**The Apple-Zone Rule.** Zone and form hues are the Apple system palette and map one-to-one to a training meaning. Never substitute an arbitrary hue or reuse a zone color decoratively.

## 3. Typography

**Display, Headline, Body & Label Font:** Space Grotesk (`--font-sans`, with `-apple-system`, system-ui fallbacks). One geometric sans does the display headline, section titles, decks, body copy, labels, nav, and buttons — weight and size carry the hierarchy. The legacy editorial serif (`--serif`) is retired and aliased to the sans.
**Numeral Font:** IBM Plex Mono (`--font-mono`, with `ui-monospace`, SF Mono, Menlo). Every number — pace, HR, distance, CTL/ATL/TSB, the scoreboard, ledger cells.

**Character:** Two faces, two jobs. Space Grotesk is the entire reading and labeling voice; IBM Plex Mono is the instrument numeral. The contrast axis is geometric-sans-vs-mono. Hierarchy comes from weight (300–650) and the type scale, not from a second display face. Display and headlines are upright (no italic).

### Type Scale (CSS vars)
`--fs-mega 68px` · `--fs-hero 42px` · `--fs-xl 27px` · `--fs-lg 19px` · `--fs-md 14px` · `--fs-sm 12.5px` · `--fs-xs 11px` · `--fs-2xs 9.5px`.

### Hierarchy
- **Display** (Space Grotesk, 600, clamp 3.5rem–6rem, line-height 0.96, -0.03em): Page nameplate headlines (`.h-display`). `em` inside flips to weight 300 dim for emphasis. Once per page. `text-wrap: balance`.
- **Headline** (Space Grotesk, 600, `--fs-xl` 27px, line-height 1.05, -0.02em): Section titles (`.h-section`).
- **Deck** (Space Grotesk, 400, 16px, line-height 1.4): Standfirst / subhead (`.deck`), in dim.
- **Body** (Space Grotesk, 400, 14px, line-height 1.5): Coach messages, descriptions, notes (`.body-serif` — name kept, now sans), in dim. Max 65–75ch.
- **Label / Eyebrow** (Space Grotesk, 600, `--fs-2xs` 9.5px, letter-spacing 0.07em, uppercase): Tile labels, kickers, nav, badges (`.lbl`, `.label`, `.kicker`, `.metric-label`), in faint.
- **Numeral** (IBM Plex Mono, tabular-nums): All data. `.mono` / `.num` inline; `.num.big` (56px), `.num.huge` (96px) for hero metrics; `.tile-num` (36px) for tiles; `.metric-display` (clamp 3.5–6rem). Note `.num` uses the *sans* with tabular-nums for tight inline figures; `.mono` and ledger/pill numerals use IBM Plex Mono.

### Named Rules
**The Instrument-Numeral Rule.** Every standalone numeric metric — pace, HR, distance, duration, percentage, CTL/ATL/TSB — is set with `font-variant-numeric: tabular-nums` so figures align in a column like an instrument readout. Tiles, ledgers, and pills use IBM Plex Mono.

**The Weight-Is-Hierarchy Rule.** With one display face, hierarchy is carried by weight (300 dim → 400 body → 590/600 labels → 650 accent buttons) and the type scale — never by switching to a second display typeface or by italic.

**The Two-Faces Rule.** Space Grotesk does everything textual; IBM Plex Mono does numerals (and only numerals). No third face.

## 4. Elevation

The Carbon Instrument lifts panels off a true-black canvas with a soft shadow and a hairline — depth is real, not flat. This is the deliberate reversal of the old print doctrine: panels float now.

### Depth Vocabulary
- **Panel shadow** (`0 1px 0 rgba(255,255,255,0.04) inset, 0 10px 30px -16px rgba(0,0,0,0.7)`): The default lift on `.panel` / `.surface-card`. A bright 1px inset top edge + a soft cast below — the panel reads as a slab raised off black. Light theme softens to `0 1px 0 rgba(0,0,0,0.02) inset, 0 8px 24px -16px rgba(0,0,0,0.22)`.
- **Hairline** (`1px solid var(--line)`): The panel edge that catches the canvas; `--line-2` / `--line-3` for stronger dividers and hover edges.
- **Accent glow** (`0 4px 16px -6px var(--accent-glow)`): Reserved lift under the one accent button; soft radial accent glow behind the hero (`.gridbg`) and the live dot.
- **Tone step** (`panel → panel-2 → panel-3`): Recessed inner blocks and hover states step *up* a graphite tone.

### Named Rules
**The Lift Rule.** Primary panels lift off the black canvas with the panel shadow + hairline. This is intentional Apple-style elevation — do not flatten panels to borderless rectangles, and do not stack a shadowed card inside a shadowed card (use `.surface-raised`, which is tone-stepped and flat).

**The Glow-Is-Rationed Rule.** Soft accent glow (button shadow, hero `.gridbg`, live dot) follows the Single-Signal Rule — at most one glowing element per screen.

## 5. Components

### Buttons (`.btn`)
Apple tinted/filled controls: rounded, soft, confident; press scales to 0.97.
- **Shape:** `11px` radius, no border, padding 9px 16px, Space Grotesk 12.5px weight 590.
- **Default (tinted):** `rgba(255,255,255,0.08)` fill, text color. Hover → `0.13`. (Light theme uses alpha-black fills.)
- **Accent** (`.btn-accent` / `.btn.rust`): Accent fill, accent-ink text, weight 650, accent-glow shadow. Hover → accent-2. The one signal action.
- **Ghost** (`.btn-ghost`): Transparent, dim text. Hover → faint white fill + full-strength text.
- **Ink** (`.btn.ink`): `panel-2` fill, text color. Hover → `panel-3`.
- **Focus:** 2px accent outline, 2px offset (global `:focus-visible`).

### Chips, Tags & Pills (all rounded)
- **Tag / Chip** (`.tag`, `.chip`): Pill-rounded (`980px`), 1px `line-2` border, transparent fill, Space Grotesk 9.5px uppercase 0.04em, dim text, padding 4px 9px. Chip variants: `.rust` (accent border + accent text), `.ink` (accent fill, accent-ink text), `.ghost` (faint).
- **Badge** (`.badge`): Pill-rounded, 1px `currentColor` border, 8.5px uppercase.
- **Pill** (`.pill`): Pill-rounded, IBM Plex Mono 10px on `panel-2`. Small inline numeric tags.
- **Form pill** (`.form-pill`): Pill-rounded, 1px `line-2`, `panel-2` fill, with an accent dot — training-state indicator.

### Cards / Containers
- **Corner Style:** `18px` (`--radius` / `--radius-card`) for panels and tiles; `12px` (`--radius-sm` / `--radius-inner`) for inner blocks and fields; `980px` for pills/badges.
- **Panel** (`.panel` / `.surface-card`): `panel` background, 1px `line` hairline, 18px radius, panel shadow. The primary elevated container. `.panel-hd` is the header strip with a bottom hairline.
- **Raised** (`.surface-raised` / `.bento-card-recessed`): `panel-2` background, 1px `line`, 18px radius, flat (no shadow). For inner blocks.
- **Slab** (`.surface-slab`): `panel`, 1px `line`, 18px radius — hero block (glow comes from `.gridbg`, not a top rule).
- **Stage** (`.surface-stage`): Transparent; open area, no chrome.
- **Hover:** Graphite tone step (`.bento-card:hover → panel-2`).
- **Nesting:** Use `.surface-raised` for inner blocks. Never a shadowed panel inside a shadowed panel.

### Inputs / Fields (`.field`)
- **Style:** 1px `line-2` border, `panel-2` background, Space Grotesk 14px text color, 12px radius.
- **Focus:** 2px accent outline (global focus-visible).
- **Placeholder:** faint.

### Navigation
- **Desktop:** Fixed left rail (`--rail-w` 66px; body padded left to clear it). Icon-led; active item carries the accent.
- **Mobile:** Fixed bottom tab bar (`.menu` / `InteractiveMenu`), `bg-2` background, 1px `line` top edge. Active tab: accent 2px underline indicator (animated opacity, not width) + accent label/icon; `iconLift` bounce on activate. Touch target ≥44px.
- **Masthead** (`.masthead`): Quiet top strip — 1px `line` bottom edge, Space Grotesk brand (weight 700, -0.02em) with a mono accent superscript, dot-separated dateline in dim.

### Scoreboard Tile (Signature Component) (`.tile`)
The instrument readout for CTL/ATL/TSB and headline metrics.
- **Frame:** 1px `line` border, `panel` background, 18px radius, padding 14px 16px 16px.
- **Label:** Space Grotesk 9.5px uppercase 0.07em dim, with a right-aligned secondary slot.
- **Number:** `.tile-num` — 36px weight 600 -0.03em, tabular-nums.
- **Delta:** Mono 11px; `.up` is fresh (green), `.down` is fatigue (red).
- **Accent variant** (`.tile.rust`): Accent-tinted border, accent label + number — the one live/peak metric.

### Ledger Table (Signature Component) (`table.ledger`)
The efforts log, set like an instrument records page.
- **Header:** Space Grotesk 9.5px uppercase 0.07em faint, 1px `line-2` bottom border.
- **Cells:** IBM Plex Mono 12px tabular-nums; 1px `line` row separators; numeric cells right-aligned (`.num-cell`); first-column labels can flip to sans (`.kicker-cell`).
- **Hover:** Row steps to `panel-2`.

### Other primitives
Seal (`.seal`, accent-ringed circle), marginalia (`.marginalia`, accent italic coach note), phase tags (`.phase-tag` with a colored dot — base→z3, build→z4, peak→accent, taper→z2), segmented bar (`.seg-bar`, 4px rounded zone-fill row), live dot (`.live-dot`, pulsing accent with glow), calendar day cell (`.day` on `panel-2`, with a `-45deg` hatched `.rest` variant), topographic SVG strokes (`.topo-stroke` text / `.topo-rust` accent) for charts.

## 6. Do's and Don'ts

### Do:
- **Do** keep panels at 18px radius, inner blocks at 12px, pills/badges at 980px.
- **Do** lift primary panels off the black canvas with the panel shadow + 1px hairline; use `.surface-raised` (flat, tone-stepped) for inner blocks.
- **Do** set every standalone number with `tabular-nums`; use IBM Plex Mono for tiles, ledgers, and pills.
- **Do** drive hierarchy with Space Grotesk weight + the type scale; keep the second face (IBM Plex Mono) for numerals only.
- **Do** ration the accent to one signal per screen: primary action, today's workout, live/peak metric, live dot.
- **Do** reference accent via `var(--accent)` / `var(--accent-2)` / `var(--accent-glow)` / `var(--accent-ink)` so preset swaps (lime/amber/cyan/coral) re-tint everything.
- **Do** step a graphite tone (`panel → panel-2`) for hover/recessed states.
- **Do** use the Apple system zone/form palette; map each hue to exactly one training meaning.
- **Do** support both themes — verify contrast under `[data-theme="light"]` (white panels) and default dark.
- **Do** respect `@media (prefers-reduced-motion: reduce)` (handled globally) and keep transitions ~180ms, state-only.

### Don't:
- **Don't** hardcode the lime hex (`#c6f833`) or any accent literal in a component — always use the CSS var so the tunable presets work.
- **Don't** flatten the design to grey-on-grey "inverted" dark mode — the canvas is true black (`#000`) and panels genuinely lift.
- **Don't** nest a shadowed panel inside a shadowed panel; inner blocks are `.surface-raised` (flat).
- **Don't** use gradient text (`background-clip: text`) or rainbow accents. Solid text or solid accent; emphasis via weight/size.
- **Don't** revert to the old editorial "Almanac" theme — cream paper, ink rules, Newsreader serif italic, square `0px` corners. This app is a dark carbon instrument now.
- **Don't** build a generic SaaS dashboard: no purple gradients, no glowing identical-card grids.
- **Don't** use fitness-influencer aesthetics: no streaks UI, no bright motivational palettes, no badge gamification.
- **Don't** build Garmin Connect: no feature-bloat, no everything-everywhere screens.
- **Don't** replicate Strava's blue/orange activity feed card grid — the explicit anti-reference.
- **Don't** set numerals in the sans display weight or headlines in mono. Two faces, two jobs.
- **Don't** animate layout properties (`width`, `height`, `top`). Use `transform`, `opacity` (e.g. nav underline animates opacity, not width).
- **Don't** let more than one element glow accent per screen.
