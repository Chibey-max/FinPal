import Link from "next/link";

import { HeroStoryController } from "@/components/hero-story-controller";
import { ArrowForwardIcon, PlayArrowIcon } from "@/components/icons";
import { LogoMark } from "@/components/logo";
import { ScrollReveal } from "@/components/scroll-reveal";
import { PaymentFlowLoop, StepLoop } from "@/components/landing-loops";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { LandingNav } from "@/components/landing-nav";

import "./landing.css";

const steps = [
  [
    "01",
    "Constrain",
    "Allowed time windows, a timezone, daily and monthly caps. No constraints means no automatic approval.",
  ],
  [
    "02",
    "Propose",
    "A product, price and currency, entered by hand or prefilled from a calendar event.",
  ],
  ["03", "Evaluate", "FinPal checks time windows, caps, price and trust."],
  ["04", "Decide", "Rules return auto-approve, review or block."],
  [
    "05",
    "Pay and audit",
    "PayPal Sandbox order, authorize, then capture or void. Every step is logged.",
  ],
] as const;

const invariants = [
  "A proposal is not a payment.",
  "An evaluation is based on stored evidence.",
  "A blocked decision can never create a payment attempt.",
  "Insufficient evidence can never cause automatic approval.",
  "Currency mismatch never triggers silent conversion.",
  "The same idempotency key never creates a second order.",
  "Capture and void cannot both succeed for one authorization.",
  "Audit records cannot be modified or deleted.",
] as const;

export default function HomePage() {
  return (
    <main className="landing-shell">
      <LandingNav />
      <ScrollReveal />

      <section id="top" className="hero-story">
        <HeroStoryController />
        <div className="hero-frame">
          <div className="card-stage" aria-hidden="true">
            {/* Scroll zoom, pointer tilt and idle float each own one layer. */}
            <div className="card-zoom" data-story="small-card">
              <div className="card-tilt" data-story="tilt">
                <div className="finpal-card">
                  <span className="finpal-card__name">FINPAL</span>
                  <span className="finpal-card__chip" />
                  <span className="finpal-card__sandbox">SANDBOX</span>
                </div>
              </div>
            </div>
          </div>
          <div className="hero-copy" data-story="intro">
            <div>
              <p className="status-line">
                <span />
                Agent-assisted purchasing · PayPal Sandbox
              </p>
              <h1>
                One agent.
                <br />
                Zero <em>blind</em> spends.
              </h1>
              <div className="hero-actions">
                <LiquidButton asChild size="xl" className="rounded-full">
                  <Link href="/app/proposals/new">Run a proposal</Link>
                </LiquidButton>
                <Link
                  className="pill-button pill-button--glass pill-button--lg"
                  href="#loop"
                >
                  <PlayArrowIcon className="pill-icon" />
                  How it works
                </Link>
              </div>
            </div>
            <p className="hero-summary">
              FinPal places a policy and evidence layer between a purchase
              proposal and a payment. It evaluates first, decides second, and
              pays only when the decision permits it.
            </p>
          </div>
          <span className="scroll-hint" data-story="hint">
            SCROLL
          </span>
          <div className="hero-flash" data-story="flash" aria-hidden="true" />
          <div className="hero-second-scene" data-story="scene-two">
            <div className="wide-card-stage" aria-hidden="true">
              <span className="wide-card-watermark">FINPAL</span>
              <div className="wide-card" data-story="wide-card">
                <div className="card-streaks" data-story="streaks">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <span className="wide-card__brand">
                  <LogoMark size={34} />
                  <b>FINPAL</b>
                </span>
                <span className="wide-card__chip" />
                <em />
              </div>
            </div>
            <div className="second-scene-top">
              <h2 data-story="evaluated">
                Evaluated <em>First</em>
              </h2>
            </div>
            <div className="second-scene-bottom">
              <div data-story="scene-copy">
                <p>
                  Every proposal is checked against your time windows, caps and
                  the median of at least three Channel3 offers before a PayPal
                  order can exist.
                </p>
                <LiquidButton asChild size="lg" className="rounded-full">
                  <Link href="/app/proposals/new">Try a proposal</Link>
                </LiquidButton>
              </div>
              <h2 data-story="before-pay">Before You Pay</h2>
            </div>
          </div>
        </div>
      </section>

      <section id="loop" className="landing-section">
        <div className="section-heading" data-reveal>
          <h2>Five steps between an idea and a payment.</h2>
          <p className="mono-note">
            a proposal is not a payment.
            <br />
            same evidence → same outcome.
          </p>
        </div>
        <StepLoop steps={steps} />
      </section>

      <section id="policy" className="landing-section policy-section">
        <div className="policy-copy" data-reveal>
          <h2>Rules you can read. Outcomes you can predict.</h2>
          <p>
            The proposed price is compared with the median of at least three
            usable Channel3 offers, in integer cents. No generative model
            decides.
          </p>
          <div className="score-list">
            <div>
              <b className="score-good">GOOD</b>
              <span>≤ 105% of median</span>
            </div>
            <div>
              <b className="score-fair">FAIR</b>
              <span>&gt; 105% and ≤ 120%</span>
            </div>
            <div>
              <b className="score-poor">POOR</b>
              <span>&gt; 120% of median</span>
            </div>
            <div>
              <b>INSUFFICIENT_DATA</b>
              <span>&lt; 3 valid offers</span>
            </div>
          </div>
        </div>
        <div
          data-reveal
          className="decision-matrix"
          role="table"
          aria-label="Decision rules"
        >
          <div className="matrix-head" role="row">
            <span>Constraints</span>
            <span>Quality</span>
            <span>Trust</span>
            <span>Cap</span>
            <span>Result</span>
          </div>
          <div role="row">
            <span>Pass</span>
            <span>Good</span>
            <span>Pass / N/A</span>
            <span>Under</span>
            <b className="score-good">AUTO_APPROVE</b>
          </div>
          <div role="row">
            <span>Pass</span>
            <span>Fair</span>
            <span>Pass</span>
            <span>Under</span>
            <b className="score-fair">MANUAL_REVIEW</b>
          </div>
          <div role="row">
            <span>Fail</span>
            <span>Any</span>
            <span>Any</span>
            <span>Any</span>
            <b className="score-poor">BLOCK</b>
          </div>
          <div role="row">
            <span>Any</span>
            <span>Poor</span>
            <span>Any</span>
            <span>Any</span>
            <b className="score-poor">BLOCK</b>
          </div>
          <div role="row">
            <span>Any</span>
            <span>Any</span>
            <span>Any</span>
            <span>Over</span>
            <b className="score-poor">BLOCK</b>
          </div>
          <div role="row">
            <span>Any</span>
            <span>Insufficient</span>
            <span>Any</span>
            <span>Any</span>
            <b className="score-fair">MANUAL_REVIEW</b>
          </div>
        </div>
      </section>

      <section id="payments" className="landing-section payment-section">
        <div className="section-heading" data-reveal>
          <h2>Reserve the money. Then decide to take it.</h2>
          <p>
            An authorization can be voided until it is captured. Guarded
            transitions make sure only one path can succeed.
          </p>
        </div>
        <PaymentFlowLoop />
      </section>

      <section id="safety" className="landing-section safety-section">
        <h2 data-reveal>It fails closed around money.</h2>
        <div className="invariant-list" data-reveal>
          {invariants.map((item, index) => (
            <div key={item}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-cta">
        <h2 data-reveal>
          Delegate the purchase. Keep the <em>receipt</em> for every decision.
        </h2>
        <p>sandbox only · every decision explained</p>
        <LiquidButton asChild size="xxl" className="rounded-full text-base">
          <Link href="/app">
            Open the sandbox <ArrowForwardIcon className="pill-icon" />
          </Link>
        </LiquidButton>
        <footer>
          <span>
            FinPal · PayPal Sandbox only. Not financial, legal or investment
            advice.
          </span>
          <span>v1 · hackathon build</span>
        </footer>
      </section>
    </main>
  );
}
