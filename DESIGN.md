---
name: "FinPal"
description: "A blue-hour financial control room for explainable, interruptible payments."
colors:
  night-canvas: "#040509"
  night-surface: "#080b12"
  control-surface: "rgba(14, 17, 26, 0.72)"
  glass-surface: "rgba(20, 24, 34, 0.65)"
  frost: "#f2f5fa"
  primary-text: "#edeef0"
  secondary-text: "#c9d0dc"
  muted-text: "#9097a1"
  quiet-text: "#7c838d"
  ice-blue: "#dce8ff"
  focus-blue: "#c8daff"
  review-amber: "#f2c879"
  blocked-coral: "#ff7a6b"
  hairline: "rgba(255, 255, 255, 0.08)"
  field-stroke: "rgba(255, 255, 255, 0.12)"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(48px, 6.4vw, 92px)"
    fontWeight: 400
    lineHeight: 0.96
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(38px, 4.7vw, 66px)"
    fontWeight: 300
    lineHeight: 1
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.06em"
rounded:
  field: "8px"
  compact: "10px"
  panel: "20px"
  frame: "28px"
  pill: "999px"
spacing:
  hairline: "1px"
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "22px"
  xl: "28px"
  section: "clamp(58px, 7vw, 106px)"
components:
  button-primary:
    backgroundColor: "{colors.frost}"
    textColor: "{colors.night-canvas}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "11px 22px"
    height: "44px"
  button-glass:
    backgroundColor: "{colors.glass-surface}"
    textColor: "{colors.frost}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "11px 22px"
    height: "44px"
  input:
    backgroundColor: "{colors.night-canvas}"
    textColor: "{colors.primary-text}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "4px 12px"
    height: "36px"
  panel:
    backgroundColor: "{colors.control-surface}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.panel}"
    padding: "18px"
  state-chip:
    backgroundColor: "{colors.glass-surface}"
    textColor: "{colors.secondary-text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "13px 20px"
---

# Design System: FinPal

## Overview

**Creative North Star: "The Blue-Hour Control Room"**

FinPal is a calm financial operations environment suspended between a PayPal-adjacent night sky and a precise control console. Deep blue-black canvases, frosted glass, restrained light blooms, and a translucent payment card give the product atmosphere without making money movement feel theatrical or opaque.

The marketing surface persuades through one exact scroll story: a long, sticky first scene resolves into an evaluated-first second scene. The application surface tightens the same world into a glassy shell, dense evidence panels, explicit decision branches, and monospace operational labels. Expression belongs in the environment; financial state and action remain literal, scannable, and calm.

**Key Characteristics:**

- Blue-black, full-bleed environments framed by large rounded containers.
- Frost-white action surfaces and icy blue light used sparingly as operational emphasis.
- Geist for clear hierarchy; Geist Mono for states, indices, paths, and machine-readable evidence.
- Translucent panels, hairline borders, and ambient blur instead of heavy card chrome.
- Explicit branches and diagrams for policy, architecture, and payment state.
- Motion that is slow, spatial, and removable without loss of meaning.

## Colors

The palette is a low-chroma midnight spectrum: nearly black foundations, cool pale type, blue-white operational light, and two tightly scoped safety accents.

### Primary

- **Frost Signal:** The rare high-contrast action color for primary buttons, selected pills, captured states, and selection inversion.
- **Ice Evidence:** The cool emphasis for approved or authorized states and architecture-layer labels.

### Secondary

- **Review Amber:** Reserved for `MANUAL_REVIEW`, attention badges, and non-terminal warnings.
- **Blocked Coral:** Reserved for destructive actions, blocked outcomes, errors, and void branches.

### Neutral

- **Night Canvas:** The page and application foundation.
- **Night Surface:** The slightly lifted fill for framed content sections.
- **Control Glass:** The translucent app-panel layer over the environmental glow.
- **Primary Text:** The default readable foreground.
- **Secondary Text:** Supporting copy that must remain comfortably readable.
- **Muted Text:** Descriptions, metadata, and inactive navigation.
- **Quiet Text:** Low-priority operational context.
- **Hairline:** The default divider and panel edge; it defines structure without drawing boxes around everything.

### Named Rules

**The Sparse Signal Rule.** Frost, amber, and coral are state-bearing colors, not decoration; the dark field must remain dominant.

**The Explicit Status Rule.** Never communicate a financial outcome by color alone. Pair every hue with a literal label such as `AUTO_APPROVE`, `MANUAL_REVIEW`, `BLOCK`, `AUTHORIZED`, or `VOIDED`.

## Typography

**Display Font:** Geist (with ui-sans-serif and system fallbacks)  
**Body Font:** Geist (with ui-sans-serif and system fallbacks)  
**Label/Mono Font:** Geist Mono (with ui-monospace and monospace fallbacks)

**Character:** One restrained grotesk family keeps the product contemporary and neutral. Extreme scale and light weights create atmosphere; the mono companion turns state, evidence, and system language into a precise operational layer.

### Hierarchy

- **Display** (400, fluid 48–92px, 0.96): Hero promises only; tightly tracked and balanced across short lines.
- **Headline** (300, fluid 38–66px, 1): Landing section declarations and large app-page headings.
- **Title** (400, 22px, 1.2): Step names and compact feature headings.
- **Body** (400, 14px, 1.6): Explanations and evidence summaries, generally held to roughly 380–680px.
- **Label** (400, 10–13px, 0.06em tracking): Uppercase statuses, paths, indices, data headings, and architecture notation.

### Named Rules

**The Two-Register Rule.** Geist speaks to people; Geist Mono speaks for the system. Do not set general prose or large headings in mono.

**The Quiet Weight Rule.** Large type earns authority through scale and spacing, not bold weight; reserve 500–600 for compact controls and local emphasis.

## Layout

The landing page sits inside a 10px outer gutter with 10px between large framed regions; on small screens both contract to 6px. Primary sections use fluid horizontal padding and generous vertical spacing, while the 28px frame radius drops to 22px below 600px.

The signature hero is a 520vh story with a sticky viewport-height frame and a deterministic stage change at 48% progress. Its first scene pairs a blue night landscape and vertically oriented translucent card with bottom-anchored copy; its second scene replaces them with a wide evaluated-first card and opposing top/bottom headlines. Below 600px the story contracts to 420vh. Reduced-motion mode removes the sticky scroll narrative, stops ambient animation, and preserves the readable first scene.

Content uses grids only where comparison matters: five equal process columns, two-column invariants and architecture, policy copy beside a decision matrix, and four app metrics. These collapse progressively at 1050px, 900px, 780px, 600px, and 560px. Wide operational structures scroll horizontally instead of compressing illegibly.

The app uses a 232px sticky sidebar, a 64px sticky top bar, and a centered content region capped at 1440px. Below 780px the sidebar becomes a horizontal navigation rail and the header becomes a dedicated horizontally scrollable demo-path control.

**The Framed World Rule.** Landing scenes are large rounded environments separated by narrow dark gutters; do not dissolve them into a generic stack of floating cards.

**The Evidence Keeps Its Shape Rule.** Matrices, calendars, state flows, and architecture diagrams may scroll or stack, but their labels and branch relationships must remain explicit.

## Elevation & Depth

FinPal uses a hybrid of tonal layering and ambient optical depth. Most structure comes from adjacent dark tones, translucent fills, and low-contrast hairlines. Shadow is reserved for luminous artifacts and state emphasis: the payment card glows, the authorized state lifts slightly, and ordinary panels remain quiet.

### Shadow Vocabulary

- **Payment Halo** (`inset 0 0 0 1px rgba(255,255,255,.06), 0 0 30px rgba(175,200,255,.72), 0 0 95px rgba(120,160,255,.32)`): The floating translucent hero card only.
- **Wide Card Lift** (`0 30px 80px rgba(0,0,0,.6), 0 10px 60px rgba(100,140,230,.25)`): The second hero scene's evaluated-first card.
- **Authorized Glow** (`0 8px 30px rgba(140,180,255,.22)`): An authorized payment state awaiting capture or void.
- **Focus Ring** (`2px solid #c8daff`, 3px offset): Keyboard focus across the product; component fields use the equivalent three-pixel translucent ring.

### Named Rules

**The Ambient-Not-Decorative Rule.** Blur and glow establish the night environment or clarify an active state; they never sit behind routine text merely for style.

**The Glass Needs an Edge Rule.** Every translucent control surface needs a hairline border so its boundary remains legible over gradients and orbs.

## Shapes

The form language moves from large architectural frames to compact operational controls. Landing frames use generous 28px corners, panels and metric cards use 20px, compact account containers use 10px, and fields use 8px. Buttons, state nodes, navigation groups, and scenario selectors are fully pill-shaped. The brand mark is a small rounded square containing a smaller square; it is geometric, quiet, and reproducible without an image asset.

The translucent hero card deliberately changes silhouette between scenes: a tall portrait card in the night landscape becomes a wide payment-card proportion during evaluation. Hairline strokes, clipped gradients, and sparse luminous diagonals provide material definition.

**The Radius Has Scale Rule.** Large corners belong to large environments; fields and dense evidence use compact corners. Do not apply one universal radius to every object.

## Components

### Buttons

Buttons are calm, tactile points of certainty rather than bright brand ornaments.

- **Shape:** Marketing actions are pills; dense app controls use compact 8px corners.
- **Primary:** Frost surface on near-black text, 44px minimum marketing height, with medium weight.
- **Hover / Focus:** Primary pills brighten to white and lift 2px over 250ms; every control receives the visible ice-blue focus treatment.
- **Glass / Ghost:** Translucent night fill, hairline edge, pale text, and backdrop blur; ghost controls add only a subtle surface on hover.
- **Destructive:** Coral is permitted only when the action or outcome is destructive.

### Chips

- **Style:** Pill geometry, mono or compact sans labels, hairline borders, and dark translucent fills.
- **State:** Selected navigation and completed payment states invert to frost with dark text. Authorized remains dark with an ice border and glow; review and blocked states retain their literal label plus amber or coral.

### Cards / Containers

- **Corner Style:** 20px for repeated cards and panels; 28px for full landing environments.
- **Background:** Dark tonal fills or control glass over the ambient app orb.
- **Shadow Strategy:** Flat by default; only signature artifacts and active payment states glow.
- **Border:** One-pixel white hairlines at 7–9% opacity.
- **Internal Padding:** Usually 18–28px; large sections use fluid 20–56px horizontal padding.

### Inputs / Fields

- **Style:** Transparent-to-night fill, 8px corners, field-strength hairline, 36px app height, and 12px horizontal padding.
- **Focus:** Border shifts to ice blue with a three-pixel translucent ring.
- **Error / Disabled:** Errors use blocked coral in both text and border/ring; disabled fields reduce opacity and remove pointer interaction.

### Navigation

Landing navigation floats over the hero and groups links inside blurred pills; the active item is frost-filled. The application navigation is a vertical glass rail with muted links and a subtle filled active row. On small screens it becomes horizontally scrollable rather than wrapping into an ambiguous grid.

### Payment State Flow

Payment states are pill nodes joined by literal directional lines. `AUTHORIZED` is visibly pending and may branch to `CAPTURED` or `VOIDED`; future or unavailable transitions use a quieter or dashed branch. Preserve the branch geometry and include the supporting sentence that explains who acts and what the system does next.

### Decision Matrix & Architecture Diagram

Operational diagrams use dark framed containers, mono headers, hairline row boundaries, and readable horizontal overflow. They are explanatory product UI, not decorative infographics: keep exact terms, thresholds, layers, arrows, and exception paths intact.

### Hero Story

The hero is an exact two-stage narrative inside a sticky rounded frame. The first stage combines night landscape, translucent portrait payment card, product promise, and two actions. The second stage replaces the foreground with an evaluated-first wide card and policy copy. Stage changes use opacity with a decisive ease; the card itself floats slowly. Reduced-motion mode shows a static first scene and removes the hidden second scene.

## Do's and Don'ts

### Do:

- **Do** preserve the blue-hour control-room atmosphere across both persuasion and operation surfaces.
- **Do** use exact monospace labels for machine states, evidence thresholds, architecture, and audit language.
- **Do** show payment branches explicitly, including capture versus void, and pair every status color with text.
- **Do** frame major landing sections as large rounded environments with narrow outer gutters.
- **Do** keep app panels translucent, bordered, and readable over the ambient orb.
- **Do** honor keyboard focus, horizontal overflow, mobile stacking, and reduced-motion fallbacks.

### Don't:

- **Don't** imply live money movement; keep `PayPal Sandbox` or equivalent simulated-funds context visible where payment actions occur.
- **Don't** turn frost, amber, or coral into decorative palette colors.
- **Don't** replace explicit decision tables, state flows, or architecture layers with vague illustrations.
- **Don't** use generic bright-blue SaaS gradients, solid white cards, or heavy drop shadows.
- **Don't** put body copy in Geist Mono or make operational labels oversized.
- **Don't** animate financial outcomes in a way that hides, delays, or changes their meaning.
