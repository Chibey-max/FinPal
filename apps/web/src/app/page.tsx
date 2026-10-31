import Link from "next/link";

import { HeroStoryController } from "@/components/hero-story-controller";
import { ArrowForwardIcon, PlayArrowIcon } from "@/components/icons";
import { LogoMark } from "@/components/logo";
import { ScrollReveal } from "@/components/scroll-reveal";
import { AgentDemo } from "@/components/agent-demo";
import { PaymentFlowLoop } from "@/components/landing-loops";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { LandingNav } from "@/components/landing-nav";

import "./landing.css";

const invariants = [
  "Finding an item never pays for it. Only your approval does.",
  "Every decision rests on prices and checks kept on record.",
  "Anything your rules block can never be paid for.",
  "Not enough price data? It comes to you, never straight through.",
  "A different currency is blocked, never quietly converted.",
  "Pressing pay twice never charges you twice.",
  "A payment is either taken or released, never both.",
  "The record of what happened can't be edited or deleted.",
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
                  <Link href="/app">Try the agent</Link>
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
              Give FinPal your shopping list. It finds real offers, checks them
              against your rules, and asks for your approval once before any
              money moves.
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
                  Every item is checked against your spending rules and at least
                  three real offers before a PayPal order can exist.
                </p>
                <LiquidButton asChild size="lg" className="rounded-full">
                  <Link href="/app">Try the agent</Link>
                </LiquidButton>
              </div>
              <h2 data-story="before-pay">Before You Pay</h2>
            </div>
          </div>
        </div>
      </section>

      <section id="loop" className="landing-section">
        <div className="section-heading" data-reveal>
          <h2>See it work. Hand over a list, approve once.</h2>
          <p className="mono-note">
            the agent shops.
            <br />
            your rules decide. you approve.
          </p>
        </div>
        <AgentDemo />
      </section>

      <section id="policy" className="landing-section policy-section">
        <div className="policy-copy" data-reveal>
          <h2>Rules you can read. Outcomes you can predict.</h2>
          <p>
            The price is compared with the middle price of at least three real
            offers. The AI shops and explains, but the rules decide.
          </p>
          <div className="score-list">
            <div>
              <b className="score-good">GOOD</b>
              <span>≤ 105% of median</span>
            </div>
            <div>
              <b className="score-fair">UNUSUALLY LOW</b>
              <span>&lt; 50% of median: a person checks it</span>
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
          <div role="row">
            <span>Any</span>
            <span>Under 50%</span>
            <span>Any</span>
            <span>Any</span>
            <b className="score-fair">MANUAL_REVIEW</b>
          </div>
        </div>
      </section>

      <section id="payments" className="landing-section payment-section">
        <div className="section-heading" data-reveal>
          <h2>One approval. FinPal does the rest.</h2>
          <p>
            You approve in PayPal, FinPal reserves the money and then takes it.
            If something goes wrong on the way, the money is released instead.
          </p>
        </div>
        <PaymentFlowLoop />
      </section>

      <section id="safety" className="landing-section safety-section">
        <h2 data-reveal>When in doubt, your money stays put.</h2>
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
          <span>
            <Link href="/privacy">Privacy</Link> ·{" "}
            <Link href="/terms">Terms</Link> · v1 hackathon build
          </span>
        </footer>
      </section>
    </main>
  );
}
