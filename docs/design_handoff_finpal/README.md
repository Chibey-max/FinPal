# Handoff: FinPal landing page + /app

## Overview
FinPal is an agent-assisted purchasing product. It puts a policy and evidence layer between a purchase proposal and a payment: it **evaluates first, decides second, and pays only when the decision permits it** (PayPal Sandbox). This bundle covers:
- **Landing page** (`/`): a cinematic scroll-driven hero, then How it works, Policy, Payments, Safety, Stack and the CTA/footer.
- **App** (`/app`): Overview, Calendar, New proposal, Decision detail, Review queue, Payments, Activity and Constraints, with a live liquid-sphere background.
- Both pages have **dark and light themes** with an animated circular-reveal toggle.

## About the design files
The files in `reference/` are **design references built in HTML**. They are prototypes that show the intended look and behaviour, not production code to copy. Recreate them in the FinPal codebase's existing environment. The design doc assumes **Next.js App Router (`apps/web`)**, with shared UI in `packages/ui`, schemas in `packages/contracts` and all decision and payment logic in `packages/backend`. Use its established patterns.

**Never port the prototype's mock decision engine into the frontend.** The UI only renders what the backend returns.

To view the references, open the `.html` files in a browser. `support.js` must sit next to them. The links between pages use the original file names (`FinPal App v4.dc.html` / `FinPal Landing v4.dc.html`), so cross-page links in the bundle will 404. That is expected.

## Fidelity
**High fidelity.** Colours, type, spacing, radii, motion and copy are final. Recreate them pixel-accurately. All copy in the references is final; use it verbatim.

## Global design language
- **Mood:** deep night-blue and near-black in dark mode; cool off-white in light mode. Glassy, frosted panels with hairline borders, very light (300) display type with tight negative tracking, and monospace for all machine values (IDs, statuses, money, endpoints).
- **Fonts** (Google Fonts):
  - **Geist** 300/400/500/600 for UI and display.
  - **Geist Mono** 400/500 for statuses, reason codes, money, IDs, eyebrows and table headers.
  - **Instrument Serif** is loaded only by older versions. Ignore it.
- **Display headings:** weight 300, `letter-spacing: -0.035em…-0.04em`, `line-height: 1`. Sizes:
  - Landing H1: `clamp(44px, 6vw, 84px)`
  - Section H2: `clamp(36px, 4.6vw, 64px)`
  - App page H1: `clamp(36px, 4vw, 52px)`
- **Body:** 13.5–15px, line-height 1.55–1.6, secondary ink (`--ink3`). Paragraphs use `text-wrap: pretty`; headings use `balance`.
- **Mono labels:** 10.5–12.5px; eyebrows and table headers are uppercase with `letter-spacing: 0.06–0.08em`.
- **Radii:**
  - Landing section shells: 28px
  - Cards: 20px
  - Panels: 14–16px
  - Inputs: 10px
  - Pills and buttons: 999px
  - Status chips: 6–8px
- **Landing shell:** the page has 10px padding and every section is a separate rounded block (`border-radius: 28px`) with a 10px gap between sections. This "stacked rounded slabs" rhythm is key.
- **Section padding:** `clamp(48px, 7vw, 104px) clamp(20px, 4vw, 56px)`.
- **Primary button:** pill, `--primary` background, `--onp` text, 14px/500, padding 12px 22px; hover changes the background to `--primaryh`.
- **Secondary button:** pill, translucent fill with `backdrop-filter: blur(12px)` and a 1px border.
- **Glass panel (app):**
  - `background: var(--panel)`
  - `backdrop-filter: blur(24px) saturate(140%)`
  - `border: 1px solid var(--w08)`
  - radius 14px
- **Status colours** (used in text, a 12% fill and a 35% border):

  | Status | Dark | Light |
  |---|---|---|
  | AUTO_APPROVE / ok | `--ok…` (cool blue-white) | navy |
  | MANUAL_REVIEW / warn | `#F2C879` | `#A5650A` |
  | BLOCK / bad | `#FF7A6B` | `#C23A28` |
  | info (payments) | `#8FB8FF` | `#2C5EC4` |

**Exact token values** for both themes are in `tokens/tokens.css` and `tokens.json`: 50 app tokens and 54 landing tokens, each with a dark and a light value. Consolidate them into one semantic token set in `packages/ui`. Many are opacity steps of white or ink (`w02…w18` = white at 2–18% in dark, ink `rgb(14,20,36)` at a similar alpha in light).

## Theme toggle (both pages)
- A 60×32px pill switch with a sliding 24px knob (`translateX(0 → 28px)`, 300ms ease). It has a crescent-moon glyph on the left and a sun glyph on the right.
- On click, call `document.startViewTransition()`, then animate `::view-transition-new(root)` with `clip-path: circle(0 at clickX clickY) → circle(R at clickX clickY)`:
  - R = the distance to the farthest viewport corner
  - 650ms, `cubic-bezier(.65,.05,.25,1)`
  - CSS: `::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}`
- Fall back to an instant swap without View Transitions or with `prefers-reduced-motion`.
- Persist the choice in `localStorage['finpal-theme']` (`'dark'` by default) and apply it before first paint to avoid a flash. In Next.js, use an inline head script or `next-themes`.
- Set `color-scheme` on the root so native inputs match.
- **In light mode the liquid sphere** gets `filter: invert(1) hue-rotate(180deg) saturate(1.3) brightness(1.04)` at opacity 0.7. The landing night scene and flash stay dark in both themes; it is a cinematic scene.

## Landing page

### Header (fixed, floats over the hero)
- Position: `top/left/right: 10px`, padding `16px clamp(16px, 2.4vw, 28px)`.
- Left: the logo, a 20px rounded-square outline mark with a filled inner square, plus "FinPal".
- Centre: a nav pill with How it works · Policy · Payments · Safety · Stack, linking to the in-page anchors `#loop #policy #payments #safety #stack`.
- Right: the theme toggle and an "Open app" primary pill linking to `/app`.

### Hero A: "Card story" (default)
A scroll-driven sequence, `section#top` with `height: 520vh`. Its inner stage is `position: sticky; top: 10px; height: calc(100vh - 20px); min-height: 620px; border-radius: 28px; overflow: hidden`.

Scroll progress is `p = clamp(-rect.top / (rect.height - innerHeight), 0, 1)`, updated in a rAF-throttled scroll handler. `seg(a, b)` maps p to 0…1 between a and b; `ease` is smoothstep. **Keep these exact timings:**

| Element | Behaviour |
|---|---|
| Night scene layer | `scale(1 + 0.18·ease(z))` with `z = seg(.10, .48)`; opacity `1 - seg(.50, .54)` |
| Intro text block (bottom) | opacity `1 - seg(.02, .14)`, `translateY(-40px · same)` |
| "Scroll" hint | opacity `1 - seg(0, .05)` |
| Small glass card | `translateY(z·8vh) scale(1 + 9z³)`, `brightness(1 + 2.2·seg(.30, .48))` |
| White flash overlay | opacity `min(seg(.34, .47), 1 - seg(.52, .62))`; radial `#FFF → #E4ECFF → #B9C8EA` |
| Scene 2 | opacity `seg(.50, .56)`; pointer-events on when p > .55 |
| Landscape card | with `k = ease(seg(.52, .86))`: `translateY((1-k)·90px) rotateX(18k + 40(1-k))deg rotateZ(-28k + 10(1-k))deg scale(.7 + .3k)` inside `perspective: 1400px` |
| Card light streaks | opacity `seg(.66, .80)`; each streak loops `fpSweep` 3.2s with staggered delays (0 / .6 / 1.2 / 1.8 / 2.4s) |
| "Evaluated First" | slides in from x -60px, `seg(.60, .70)` |
| "+ Policy" chip | from +40px, `seg(.62, .72)` |
| "Before You Pay" | from +60px, `seg(.72, .82)` |
| Paragraph + CTA | from -40px, `seg(.80, .90)` |

- **Small glass card:** a vertical card, width `clamp(140px, 14vw, 190px)`, aspect 0.63, radius 16.
  - Fill: `linear-gradient(160deg, rgba(190,210,255,.22), rgba(60,80,130,.12) 45%, rgba(140,170,230,.16))`
  - Border: `1px rgba(215,228,255,.6)`
  - Glow: `0 0 28px rgba(150,185,255,.6), 0 0 90px rgba(120,160,255,.28)`
  - Contents: vertical "FINPAL" text, a silver chip and vertical "SANDBOX" text, plus a diagonal sheen overlay.
  - It tilts with the mouse (`rotateY(x·28deg) rotateX(-y·18deg)`, 0.3s ease-out) inside `perspective: 1200px`.
- **Intro text:** "One agent. / Zero blind spends." with the eyebrow "Agent-assisted purchasing · PayPal Sandbox", a "Run a proposal" primary button and a "How it works" secondary button with a play glyph. The right column holds a 14px paragraph.
- **Landscape card:** width `clamp(300px, 44vw, 560px)`, aspect 1.586, radius 24.
  - Fill: `linear-gradient(150deg, rgba(80,100,140,.45), rgba(25,35,58,.78) 50%, rgba(55,75,115,.5))`
  - Border: `rgba(190,210,255,.28)`
  - Shadow: `0 30px 80px rgba(0,0,0,.6), 0 10px 60px rgba(100,140,230,.25)`
  - Contents: logo and "FINPAL" at top right, a silver chip at left-middle.
  - A giant faint "FINPAL" watermark (alpha .03) sits behind it.
- **Night scene** (`reference/night-scene.js`, Canvas 2D) shows a sky gradient, twinkling stars, a moon with a halo, drifting cloud puffs and three parallax mountain ridges with mist. It parallaxes subtly with the mouse.
  - Recreate it as a React client component wrapping a canvas.
  - Optional props let real footage replace it: `heroVideoUrl` for the hero, `sceneVideoUrl` for scene 2.

### Hero B: "Fluid sphere" (alternative)
A centred full-height block with the liquid sphere (`radius 0.47, cy -0.02`) behind:
- Headline: "When an agent proposes a purchase, the rules answer first"
- Mono sub-line: "evaluate · decide · authorize · capture or void / every step written to an append-only log"
- Button: "See it in motion →"

### How it works (`#loop`)
- H2 "Five steps between an idea and a payment." with a mono aside on the right.
- A grid of five cards: `repeat(auto-fit, minmax(200px, 1fr))`, gap 10, radius 20, a subtle top-to-bottom tint gradient and a hairline border. Each card holds:
  - a mono number (01–05)
  - a 22px/400 title: Constrain · Propose · Evaluate · Decide · Pay and audit
  - a 13.5px description

### Policy (`#policy`)
- Two columns.
- Left: H2 "Rules you can read. Outcomes you can predict.", a paragraph, then a 4-row score legend:
  - GOOD ≤105% of median
  - FAIR >105% and ≤120%
  - POOR >120%
  - INSUFFICIENT_DATA <3 offers
- Right: a policy table with columns Constraints / Quality / Merchant trust / vs cap / Result, and six rows. The result is coloured by outcome.

### Payments (`#payments`)
- H2 "Reserve the money. Then decide to take it." on a radial blue glow background.
- A pill-node state diagram: CREATED → APPROVED → **AUTHORIZED** (glowing border) → CAPTURED (filled primary).
- VOIDED (bad colour) branches off AUTHORIZED; "REFUNDED · future" is dashed.

### Safety (`#safety`)
H2 "It fails closed around money." above an eight-item list of invariants, each with a mono number. The text is verbatim in the reference.

### Stack (`#stack`)
- **Six integration cards** with a "Must have" / "Should have" / "Foundation" tag: PayPal Sandbox, Channel3, AG Grid, KERNEL, Bryntum Calendar, Supabase.
- **Architecture:** a mono tree diagram plus four layer cards (apps/web, API routes, packages/backend, packages/contracts).

### CTA + footer
- Large H2 "Delegate the purchase. Keep the receipt for every decision." with an "Open the sandbox" button.
- Footer:
  - Disclaimer: "FinPal · PayPal Sandbox only. Not financial, legal or investment advice."
  - Version: "v1 · hackathon build"

## App (`/app`)

### Shell
- **Background:** `--bg`, with the fixed full-viewport **liquid sphere** (`reference/fluid-sphere.js`, a WebGL fragment shader) behind everything (z-index 0, pointer-events none).
  - Default "Right orb" placement: `radius .62, cx .62, cy .18, intensity 1`.
  - Alternatives: "Centered orb" (`.46 / 0 / -.02 / .85`) or "Off".
  - A `--veil` radial overlay keeps text readable.
- **Sphere rendering:** domain-warped fBm liquid (deep navy, steel blue, warm amber, pale cream), a rim light, a mouse-tracking specular highlight (eased at 0.04 per frame) and an outer glow, all very slow (`t·0.055`).
- **Layout:** the default is a "Top bar" layout; the alternative is a 232px sticky glass sidebar.
- **Top bar:** sticky, `--chrome` background, blur 20px, hairline bottom border. It contains:
  - the logo
  - a horizontally scrollable nav pill (no wrap) with Overview · Calendar · New proposal · Decisions · Review queue · Payments · Activity · Constraints. Review and Payments show a count badge in warn colour.
  - a "Demo path" segmented control (Auto-approve / Manual review / Blocked; the active segment fills with its outcome colour)
  - the theme toggle
- **Content:** max-width 1280, padding `clamp(20px, 3vw, 36px) clamp(16px, 3vw, 32px) 80px`, gap 24.

### Screens
1. **Overview:**
   - A row of four KPI cards: Spent today / This month / Decisions / Open payments. Each has a mono eyebrow, a large figure, a 4px progress bar against the cap, and a sub-line.
   - Below: a "Recent decisions" list (2-column span) and a "Needs your action" list.
2. **Calendar:**
   - A 7-day week grid (Mon 19 to Sun 25, Oct 2026) with info-tinted event chips.
   - A side panel shows the selected event and a "Create proposal from event" button. It prefills the source, context and time only; product and price stay empty.
3. **New proposal:**
   - Form fields: Product name, Proposed price (mono), Currency, Source, Eval time, KERNEL (simulated).
   - Preset chips: Auto-approve, Manual review, Blocked, Insufficient data, Outside window, Currency mismatch.
   - A calendar-context banner shows when the proposal comes from an event.
   - The "Evaluate proposal" button is dimmed until the form is valid.
   - A "Rules in force" side panel.
4. **Decision detail:**
   - A decisions table with columns ID / Product / Amount / Quality / Source / Outcome.
   - Detail header: product, amount and a large outcome chip, followed by the explanation paragraph.
   - **Price evidence panel:** a band chart with GOOD/FAIR/POOR zones, a median marker, a "proposed" marker and offer dots, followed by an offer list. Excluded offers are dimmed and labelled with the reason (used / duplicate / out of stock / other currency / invalid link).
   - Constraints-and-caps checklist (PASS/FAIL/OVER), a merchant trust card, and reason-code chips.
   - Action bar, depending on the outcome:
     - "Create PayPal order" when payable
     - "View payment" when a payment exists
     - a review notice when review is needed
     - a blocked notice otherwise
5. **Review queue:** cards for MANUAL_REVIEW decisions with Evidence, Reject and Approve buttons. The empty state is a dashed panel.
6. **Payments:**
   - A list of payment attempts.
   - Detail: amount, status chip and a 4-step state rail. Action tiles show their endpoint: Approve in PayPal / Authorize / Capture / Void / Retry create.
   - Invalid actions sit at 38% opacity but stay clickable to demonstrate a guarded-transition rejection, which shows a toast and writes an audit row.
   - A state history list.
   - Approving opens a light "PayPal Sandbox" modal.
7. **Activity:** a sortable append-only audit table (Time / Event / Entity / Detail) with All/Decisions/Payments/Config filters. Event types are colour-coded.
8. **Constraints:**
   - An Enforced/Not configured toggle; when disabled, a warn banner explains that everything goes to review.
   - Fields: timezone, start (inclusive), end (exclusive) with a cross-midnight note, per-transaction / daily / monthly caps, currency.
   - A "Save constraints" button.

Toasts are fixed bottom-right, max-width 380, with an ok or bad tinted border and a 3.6s timeout.

## Behaviour and business rules (backend-owned)
The prototype mocks these. The real implementation lives in `packages/backend`.
- Money is handled in **integer cents**. The median needs **at least 3 usable offers** after normalisation: drop duplicates, used, out-of-stock, invalid and other-currency offers.
- Score: ratio = proposed / median. GOOD ≤ 1.05, FAIR ≤ 1.20, POOR > 1.20.
- Outcome:

  | Condition | Outcome |
  |---|---|
  | Constraint fail, any cap exceeded, or POOR | BLOCK |
  | No constraints, INSUFFICIENT_DATA, or trust FAIL/UNAVAILABLE | MANUAL_REVIEW |
  | GOOD | AUTO_APPROVE |
  | FAIR | MANUAL_REVIEW |

- The time window has an inclusive start and an exclusive end, and may cross midnight. Currencies are never converted.
- Payment states: CREATED → APPROVED → AUTHORIZED → CAPTURED | VOIDED. Capture and void are mutually exclusive. Payment creation is idempotent per decision (`idem_<decisionId>`).
- Every step emits an append-only audit event, e.g.:
  - `PROPOSAL_CREATED`, `EVALUATION_COMPLETED`, `DECISION_CREATED`
  - `REVIEW_APPROVED`/`REVIEW_REJECTED`
  - `PAYMENT_ORDER_CREATED`, `PAYPAL_APPROVAL_RETURNED`, `PAYMENT_AUTHORIZED`, `PAYMENT_CAPTURED`, `PAYMENT_VOIDED`
  - `PAYMENT_CREATE_DEDUPED`, `TRANSITION_REJECTED`, `CONSTRAINTS_UPDATED`

## State (frontend)
- `theme`
- current route (use real Next.js routes: `/app`, `/app/calendar`, `/app/proposals/new`, `/app/decisions/[id]`, `/app/review`, `/app/payments/[id]`, `/app/activity`, `/app/constraints`)
- form state for the proposal and constraints
- the selected calendar event
- the modal and the toast

Everything else comes from the API: decisions, payments, the audit log, constraints and spend totals.

## Assets
- No images. All visuals are CSS, Canvas 2D (`night-scene.js`) or WebGL (`fluid-sphere.js`).
- Port the two scripts into client components, keeping the shader and drawing code as-is.
- Fonts come from Google Fonts.

## Files
- `reference/FinPal-Landing-v4.html`: the landing page (latest).
- `reference/FinPal-App-v4.html`: the app (latest), including the mock logic, which is the best spec for UI states.
- `reference/fluid-sphere.js`: the WebGL liquid sphere web component (`radius`, `cx`, `cy`, `intensity` attributes).
- `reference/night-scene.js`: the Canvas night landscape web component.
- `reference/support.js`: the runtime needed to open the reference HTML. Not for production.
- `tokens/tokens.css`, `tokens/tokens.json`: every dark and light colour token.
