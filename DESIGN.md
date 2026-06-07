---
name: Runiqlo — The Almanac
description: A runner's almanac. Personal training dashboard rendered as an editorial broadsheet.
colors:
  paper: "#f2ede2"
  paper-2: "#ebe4d3"
  paper-3: "#e3dac3"
  ink: "#1a1814"
  ink-2: "#4a4136"
  ink-3: "#786e5b"
  rule: "#c9c1ad"
  rule-2: "#d8d1bd"
  rust: "#c93f1d"
  rust-dim: "#a83518"
  zone-green: "#6b8a76"
  zone-yellow: "#b08550"
  zone-orange: "#dc8a5b"
  zone-blue: "#4a6079"
  zone-purple: "#7a6a86"
  zone-cyan: "#6b9c9c"
  gold: "#b08550"
typography:
  display:
    fontFamily: "Newsreader, Source Serif Pro, Georgia, serif"
    fontSize: "clamp(3.5rem, 6vw, 6rem)"
    fontWeight: 400
    lineHeight: 0.92
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Newsreader, Source Serif Pro, Georgia, serif"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.015em"
  deck:
    fontFamily: "Newsreader, Source Serif Pro, Georgia, serif"
    fontSize: "18px"
    fontWeight: 300
    lineHeight: 1.35
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Newsreader, Source Serif Pro, Georgia, serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, Helvetica Neue, Arial, sans-serif"
    fontSize: "9px"
    fontWeight: 400
    letterSpacing: "0.18em"
  num:
    fontFamily: "JetBrains Mono, IBM Plex Mono, ui-monospace, monospace"
    fontSize: "36px"
    fontWeight: 500
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
rounded:
  card: "0px"
  inner: "0px"
  badge: "0px"
  pill: "99px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.inner}"
    padding: "8px 14px"
  button-ink-hover:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.paper}"
  button-rust:
    backgroundColor: "{colors.rust}"
    textColor: "{colors.paper}"
    rounded: "{rounded.inner}"
    padding: "8px 14px"
  button-rust-hover:
    backgroundColor: "{colors.rust-dim}"
    textColor: "{colors.paper}"
  button-ghost:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.inner}"
    padding: "8px 14px"
  button-ghost-hover:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
  card-surface:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
  card-raised:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.inner}"
    padding: "10px 12px"
  chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.badge}"
    padding: "3px 8px"
  chip-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.badge}"
    padding: "3px 8px"
  tile:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "14px 16px 16px"
---

# Design System: Runiqlo — The Almanac

## 1. Overview

**Creative North Star: "The Runner's Almanac"**

Runiqlo is a printed almanac for a single athlete, not an app skin. The interface is a cream-paper broadsheet: ink-black hairline rules, a serif italic masthead, mono numerals set like a box score, and one hot rust accent reserved for race-day signal. It reads like the front page of a sport gazette that happens to know your CTL. The chrome recedes into paper and rule; the data is the headline.

It rejects every fitness-app and SaaS-dashboard reflex. No purple gradients, no metric-card grids with glow, no streak badges or motivational copy, no Strava blue feed. It also rejects its own former self: this is not the dark terminal "Dark Lab" the project once shipped. Warmth here is carried by paper, serif, and letterpress detail, never by a near-white tint pretending to be a dark surface. Square corners, no shadows, no blur. Depth comes from ink rules and paper tones, the way ink sits on a printed page.

The athlete reads this at a kitchen table with morning light, or on a phone after a run. The ambient light is daylight; the surface is paper that reflects it. Density is editorial: a masthead, a scoreboard of tiles, a ledger of efforts, marginalia from the coach.

**Key Characteristics:**
- Cream paper base (`#f2ede2`) with two darker paper tones; never a card-on-card stack
- Ink-black hairline borders (1px) and hard rules (2px); square corners everywhere (`0px` radius)
- One rust accent (`#c93f1d`), used for race-day signal and primary action only
- Three typefaces with clear jobs: Newsreader serif (display + body), Geist sans (labels), JetBrains Mono (numerals)
- Tabular mono numerals throughout — every metric reads like a box score
- No shadows, no blur; depth from ink rules and paper tone steps

## 2. Colors: The Broadsheet Palette

A warm cream-and-ink palette with one hot accent. Color is paper and ink first; the rust and the muted zone hues are the only saturation, and each carries meaning.

### Primary
- **Rust** (`#c93f1d`): The single hot accent. Race-day signal: primary CTA, active nav underline, today's workout highlight, peak-phase marker, the coach's marginalia, the stamped seal. Reserved; its rarity is the signal. **Rust-Dim** (`#a83518`) is its pressed/hover state.

### Secondary — Zone & Phase Hues
Muted, earthy versions of the training vocabulary, tuned to sit on paper without shouting.
- **Zone Green** (`#6b8a76`): Easy effort, Zone 1–2, recovery and long runs; base training phase. Success states.
- **Zone Yellow / Gold** (`#b08550`): Tempo effort, Zone 3; build phase; medals/bronze. Warning states.
- **Zone Orange** (`#dc8a5b`): Threshold, gym, cross-training; Zone 4–5 adjacent.
- **Zone Blue** (`#4a6079`): Cycling, aerobic indicators; taper phase. Informational states.
- **Zone Purple** (`#7a6a86`): VO2max, anaerobic, yoga. Secondary informational.
- **Zone Cyan** (`#6b9c9c`): Recovery, swim, cooldown steps.

### Neutral — Paper & Ink
- **Paper** (`#f2ede2`): App base and primary card background. The page.
- **Paper-2** (`#ebe4d3`): Recessed/raised surfaces, hover fill, rest-day hatching.
- **Paper-3** (`#e3dac3`): Deepest paper tone; pills, nested recesses.
- **Ink** (`#1a1814`): Headlines, key values, hard rules, hairline card borders. The print color.
- **Ink-2** (`#4a4136`): Supporting text, decks, metadata, masthead lines.
- **Ink-3** (`#786e5b`): Labels, muted captions, placeholders, scrollbar hover.
- **Rule** (`#c9c1ad`): Faint contour rules, subtle dividers, dotted ledger lines, default scrollbar.
- **Rule-2** (`#d8d1bd`): Lightest divider tone.

### Named Rules
**The Rust Rationing Rule.** Rust appears once, maybe twice, per screen. It marks the one thing that matters now: the primary action, today's workout, the live race signal. A page where three things are rust has nothing urgent.

**The Ink-On-Paper Rule.** Structure is drawn with ink rules and paper tone steps, never with shadow, blur, or color fills. If a surface needs to separate from another, it gets a 1px ink hairline or a paper-tone step, not a drop shadow.

**The Muted-Zone Rule.** Zone and phase colors are deliberately desaturated to live on cream paper. Never substitute a bright, full-saturation version; the gazette doesn't print neon. Each hue maps to one training meaning and is never reused decoratively.

## 3. Typography

**Display & Body Font:** Newsreader (with Source Serif Pro, Georgia, serif). Set in *italic* for display, section headlines, decks, and the masthead brand — the almanac's voice.
**Label Font:** Geist (with Helvetica Neue, Arial, sans-serif). Uppercase, wide-tracked, small. The sans does only labels, kickers, nav, and buttons.
**Numeral Font:** JetBrains Mono (with IBM Plex Mono, ui-monospace, monospace). Every number — pace, HR, distance, CTL/ATL/TSB, the scoreboard. Exposed in CSS as `--font-geist-mono`.

**Character:** Three faces, three jobs, no overlap. Newsreader italic is the headline voice and the reading voice; Geist is the quiet sans label; JetBrains Mono is the box-score numeral. The contrast axis is serif-vs-sans-vs-mono, never two similar sans competing.

### Hierarchy
- **Display** (Newsreader italic, 400, clamp 3.5rem–6rem, line-height 0.92, -0.03em): Page nameplate headlines (`.h-display`). `em` inside flips to upright weight 200 for emphasis. Once per page. `text-wrap: balance`.
- **Headline** (Newsreader italic, 500, 28px, line-height 1, -0.015em): Section titles (`.h-section`).
- **Deck** (Newsreader italic, 300, 18px, line-height 1.35): Standfirst / subhead under a headline (`.deck`), in ink-2.
- **Body** (Newsreader, 400, 14px, line-height 1.5): Coach messages, workout descriptions, notes (`.body-serif`), in ink-2. Max 65–75ch.
- **Label** (Geist, 400, 9px, letter-spacing 0.18em, uppercase): Tile labels, kickers, nav, badges (`.label`, `.kicker`, `.metric-label`), in ink-3.
- **Numeral** (JetBrains Mono, tabular-nums): All data. `.num` for inline; `.num.big` (56px), `.num.huge` (96px) for hero metrics; `.tile-num` (36px) for the scoreboard; `.metric-display` (clamp 3.5–6rem).

### Named Rules
**The Box-Score Rule.** Every numeric metric — pace, HR, distance, duration, percentage, CTL/ATL/TSB — is JetBrains Mono with `font-variant-numeric: tabular-nums`. Numbers in a serif or sans are a bug; they must align in a column like a box score.

**The Italic-Voice Rule.** Display and section headlines are Newsreader *italic*. The italic is the almanac's voice; an upright serif headline reads as a different publication. Reserve upright weight (200) for the emphasized `em` inside a display line.

**The Sans-Is-Labels-Only Rule.** Geist appears only as small uppercase labels, kickers, nav, and button text. It never sets a headline, a body paragraph, or a number.

## 4. Elevation

The Almanac is print: flat, shadowless, by doctrine. `--shadow-base`, `--shadow-elevated`, and `--shadow-slab` are all set to `none`. There is no blur and no backdrop-filter; the legacy glass classes are remapped to flat paper. Depth is conveyed exactly two ways, the way ink behaves on a page: hairline ink rules and paper-tone steps.

### Depth Vocabulary (no shadows)
- **Ink hairline** (`1px solid #1a1814`): The default card and tile edge. Separates a surface from the page.
- **Hard rule** (`2px solid #1a1814`): Masthead bottom, header bottom, section dividers (`.rq-rule.thick`).
- **Double rule** (`6px double #1a1814`): Masthead top edge; the broadsheet nameplate signature.
- **Rust top rule** (`3px solid #c93f1d` on `.surface-slab`): A hero slab carrying race-day energy.
- **Paper-tone step** (`paper → paper-2 → paper-3`): Recessed and hover surfaces step down a paper tone instead of lifting.

### Named Rules
**The Print Rule.** Surfaces never lift. No `box-shadow`, no `backdrop-filter`, no blur, anywhere. If 2014's app problem was "shadow too dark, blur too small," the Almanac's answer is no shadow at all: this is ink on paper, and paper doesn't float.

**The Tone-Step Rule.** Hover and recessed states step a paper tone (`paper → paper-2`), never add a shadow and never animate a layout property.

## 5. Components

### Buttons (`.btn`)
The letterpress control: square, hard-edged, uppercase sans label, confident.
- **Shape:** Square (`0px` radius), 1.5px ink border, padding 8px 14px, Geist 11px uppercase letter-spacing 0.12em.
- **Ghost (default):** Paper background, ink text. Hover: steps to paper-2.
- **Ink:** Ink fill, paper text. Hover: ink-2. The standard primary.
- **Rust:** Rust fill, paper text, rust border. Hover: rust-dim. Reserved for the one race-day primary action.
- **Focus:** 2px rust outline, 2px offset (global `:focus-visible`).

### Chips & Pills
- **Chip** (`.chip`): Square, 1px ink border, Geist 9px uppercase 0.18em, padding 3px 8px. Variants: `.rust` (rust border + text), `.ink` (ink fill, paper text), `.ghost` (rule border, ink-3 text).
- **Pill** (`.pill`): The one rounded exception (`99px`) — mono 10px on paper-3. Used for small inline numeric tags.
- **Form pill** (`.form-pill`): 1.5px ink border with a rust dot; training-state indicator.

### Cards / Containers
- **Corner Style:** Square (`0px`) everywhere — `--radius-card`, `--radius-inner`, `--radius-badge` all `0`.
- **Surface card** (`.surface-card`): Paper background, 1px ink hairline border. The primary container.
- **Raised** (`.surface-raised`): Paper-2 background, 1px rule border. For recessed/inner blocks.
- **Slab** (`.surface-slab`): Paper, 1px ink border, 3px rust top rule. The hero block.
- **Stage** (`.surface-stage`): Transparent; open broadsheet area, no chrome.
- **Hover:** Paper-tone step (`bento-card:hover → paper-2`). Never a shadow.
- **Nesting:** Use `.surface-raised` for inner blocks. Never a bordered card inside a bordered card.

### Inputs / Fields (`.field`)
- **Style:** 1px ink border, paper background, Newsreader *italic* 14px in ink-2, square corners. The field reads like a fill-in-the-blank line on a form.
- **Focus:** 2px rust outline (global focus-visible). No glow.
- **Placeholder:** ink-3 minimum; do not go lighter than ink-3 on paper.

### Navigation
- **Desktop:** Fixed top bar, paper background, 2px ink bottom rule. Links are Geist uppercase 12px. Active: 2px rust underline + ink text; inactive: ink-2; hover steps toward ink. Icon + label always.
- **Mobile:** Fixed bottom tab bar (`InteractiveMenu`), paper background, 2px ink top rule. Active tab: rust 2px underline indicator (animated opacity, not width) + rust label/icon; `iconBounce` on activate. Touch target ≥44px.
- **Masthead** (`.masthead`): The broadsheet nameplate — 6px double ink top rule, 2px ink bottom rule, italic serif brand with a mono rust superscript, dot-separated sans dateline.

### Scoreboard Tile (Signature Component) (`.tile`)
The box-score readout for CTL/ATL/TSB and headline metrics.
- **Frame:** 1px ink border, paper background, padding 14px 16px 16px, square.
- **Label:** Geist 9px uppercase 0.22em ink-2, with a right-aligned secondary slot.
- **Number:** JetBrains Mono 36px, weight 500, -0.03em.
- **Delta:** Mono 11px; `.up` is rust, `.down` is ink-3.
- **Rust variant** (`.tile.rust`): Rust border, rust label and number — the one live/peak metric.

### Ledger Table (Signature Component) (`table.ledger`)
The efforts log, set like an almanac records page.
- **Header:** Geist 9px uppercase 0.18em ink-3, 1px ink bottom rule.
- **Cells:** JetBrains Mono 12px tabular-nums; 1px **dotted** rule row separators; numeric cells right-aligned (`.num-cell`); first-column labels can flip to Newsreader italic (`.kicker-cell`).
- **Hover:** Row steps to paper-2.

### Other editorial primitives
Seal (`.seal`, rotated rust stamp), marginalia (`.marginalia`, rust serif italic coach note), phase tags (`.phase-tag` with a square color block), calendar day cell (`.day`, with `-45deg` hatched `.rest` variant), topographic SVG strokes (`.topo-stroke` / `.topo-rust`) for charts.

## 6. Do's and Don'ts

### Do:
- **Do** keep every corner square (`0px` radius) — the one allowed exception is `.pill` at `99px`.
- **Do** draw structure with 1px ink hairlines, 2px hard rules, and paper-tone steps. Reach for `.rq-rule` / `.rq-rule.thick` / `.rq-rule.double`.
- **Do** set every number in JetBrains Mono with `tabular-nums`. Pace, HR, distance, CTL/ATL/TSB, percentages — all box-score.
- **Do** set display and section headlines in Newsreader *italic*; keep Geist for labels/nav/buttons only.
- **Do** ration rust to one race-day signal per screen: primary action, today's workout, live/peak metric, marginalia.
- **Do** step a paper tone (`paper → paper-2`) for hover/recessed states.
- **Do** desaturate zone and phase colors to sit on cream paper; map each hue to exactly one training meaning.
- **Do** respect `@media (prefers-reduced-motion: reduce)` (handled globally) and keep transitions 150–250ms, state-only.

### Don't:
- **Don't** add any `box-shadow`, `backdrop-filter`, or blur. The Print Rule: paper doesn't float. Glassmorphism is banned by name.
- **Don't** use `border-left`/`border-right` >1px as a colored side-stripe on cards, callouts, or list items. Use full ink borders, paper tints, or leading numerals/dots.
- **Don't** use gradient text (`background-clip: text`) or any gradient accent. Solid ink or solid rust only; emphasis via weight/size.
- **Don't** revert to the old dark "Dark Lab" terminal theme — near-black surfaces, Geist-everywhere, orange-only. This app is light editorial paper now.
- **Don't** build a generic SaaS dashboard: no purple gradients, no glowing hero-metric cards, no identical-card grids.
- **Don't** use fitness-influencer aesthetics: no streaks UI, no bright motivational palettes, no badge gamification.
- **Don't** build Garmin Connect: no feature-bloat, no everything-everywhere screens.
- **Don't** replicate Strava's blue/orange activity feed card grid — the explicit anti-reference.
- **Don't** set numbers in serif or sans, or headlines in Geist. Three faces, three jobs.
- **Don't** animate layout properties (`width`, `height`, `top`). Use `transform`, `opacity`, `clip-path` (e.g. nav underline animates opacity, not width).
- **Don't** nest a bordered card inside a bordered card; use `.surface-raised` for inner blocks.
