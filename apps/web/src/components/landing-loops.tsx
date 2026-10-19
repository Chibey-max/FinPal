"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type RefObject,
} from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (notify: () => void) => {
  const media = matchMedia(REDUCED);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};

/**
 * Advances `step` from 0 to `count` (one past the last = "all done") every
 * `interval` ms, holds, then restarts. Runs only while the element is on
 * screen; with reduced motion it rests on the finished state.
 */
function useLoop(
  ref: RefObject<HTMLElement | null>,
  count: number,
  interval: number,
  hold: number,
) {
  const [step, setStep] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [running, setRunning] = useState(false);
  const reduced = useSyncExternalStore(
    subscribeReduced,
    () => matchMedia(REDUCED).matches,
    () => false,
  );

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setRunning(Boolean(entry?.isIntersecting)),
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  useEffect(() => {
    if (!running || reduced) return;
    const timer = window.setTimeout(
      () => {
        if (step >= count) {
          setStep(0);
          setCycle((value) => value + 1);
        } else {
          setStep((value) => value + 1);
        }
      },
      step >= count ? hold : interval,
    );
    return () => window.clearTimeout(timer);
  }, [running, reduced, step, count, interval, hold]);

  return { step: reduced ? count : step, cycle, animate: !reduced };
}

const STEP_MS = 2200;

export function StepLoop({
  steps,
}: {
  steps: readonly (readonly [string, string, string])[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { step, cycle, animate } = useLoop(ref, steps.length, STEP_MS, 1400);

  return (
    <div
      ref={ref}
      className="step-grid"
      data-reveal
      style={{ "--step-ms": `${STEP_MS}ms` } as CSSProperties}
    >
      {steps.map(([number, title, description], index) => {
        const state =
          index < step ? "done" : index === step ? "active" : "todo";
        return (
          <article className="step-card" key={number} data-state={state}>
            <span className="step-card__number">
              <i aria-hidden />
              {number}
            </span>
            <div>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
            <span className="step-card__bar" aria-hidden>
              <span
                key={`${cycle}-${state}`}
                data-animate={animate || undefined}
              />
            </span>
          </article>
        );
      })}
    </div>
  );
}

const FLOW_MS = 1700;
const CAPTIONS = [
  "FinPal creates the PayPal order",
  "The buyer approves in PayPal Sandbox",
  "FinPal authorizes: the money is reserved, not taken",
];

export function PaymentFlowLoop() {
  const ref = useRef<HTMLDivElement>(null);
  const { step, cycle } = useLoop(ref, 4, FLOW_MS, 1600);
  // Alternate cycles end in capture or void, so both branches are shown.
  const voided = cycle % 2 === 1;
  const states = [
    "CREATED",
    "APPROVED",
    "AUTHORIZED",
    voided ? "VOIDED" : "CAPTURED",
  ];
  const reached = Math.min(step, 3);
  const caption =
    step >= 3
      ? voided
        ? "Voided before capture: nothing is taken"
        : "Captured: the payment completes"
      : CAPTIONS[step];
  const node = (index: number) =>
    index < reached ? "done" : index === reached ? "current" : "todo";

  return (
    <div ref={ref} className="flow" aria-label="Payment state flow" data-reveal>
      <div className="flow__track">
        {["CREATED", "APPROVED", "AUTHORIZED", "CAPTURED"].map(
          (label, index) => (
            <div key={label} className="flow__segment">
              {index > 0 ? (
                <span
                  className="flow__link"
                  data-filled={
                    index <= reached && !(index === 3 && voided)
                      ? true
                      : undefined
                  }
                  aria-hidden
                />
              ) : null}
              <span
                className="flow__node"
                data-state={index === 3 && voided ? "todo" : node(index)}
                data-final={index === 3 || undefined}
              >
                {label}
                {index === 2 ? (
                  <span
                    className="flow__branch flow__branch--void"
                    data-lit={voided && step >= 3 ? true : undefined}
                  >
                    <i aria-hidden />
                    VOIDED
                  </span>
                ) : null}
                {index === 3 ? (
                  <span className="flow__branch flow__branch--future">
                    <i aria-hidden />
                    REFUNDED · future
                  </span>
                ) : null}
              </span>
            </div>
          ),
        )}
      </div>
      <p className="flow__caption" aria-live="polite">
        <span className="flow__caption-state">{states[reached]}</span>
        {caption}
      </p>
    </div>
  );
}
