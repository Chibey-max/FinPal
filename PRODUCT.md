# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People delegating a proposed purchase to an automated assistant while retaining explicit control over price, timing, caps, approval, and payment capture. Hackathon reviewers also need to understand and verify the complete safety flow quickly.

## Product Purpose

FinPal is a sandbox-only, agent-assisted purchasing system. It evaluates a proposal against user constraints and market evidence, produces a deterministic decision, and permits a PayPal Sandbox payment only when policy allows it. Success means every payment can be explained, interrupted before capture, and reconstructed from an append-only audit trail.

## Positioning

FinPal places a deterministic policy-and-evidence layer between an agent's purchase proposal and a payment. It does not treat payment permission as sufficient approval.

## Operating Context

Users sign in, configure constraints, create a proposal manually or from calendar context, review Channel3 price evidence and an approval decision, then authorize, capture, or void a PayPal Sandbox payment. Decisions and payment transitions remain visible in the activity history.

## Capabilities and Constraints

- Next.js application with shared TypeScript contracts and backend domain rules.
- Supabase authentication, PostgreSQL, and row-level security.
- Channel3 comparable offers and deterministic quality scoring.
- Outcomes are `AUTO_APPROVE`, `MANUAL_REVIEW`, or `BLOCK`.
- Payments follow `CREATED → APPROVED → AUTHORIZED → CAPTURED`, with `AUTHORIZED → VOIDED`.
- Centrally configured PayPal Sandbox credentials; no user PayPal OAuth.
- KERNEL merchant trust and Bryntum Calendar are planned integrations.
- The prototype must never imply live payments.

## Brand Commitments

- Product name: FinPal.
- The approved visual references are the `v4` landing and app prototypes in `docs/FinPal landing and app prototype/`.
- Voice is concise, calm, precise, and explicit about financial safety.
- “A proposal is not a payment” and “sandbox only” are durable product truths.

## Evidence on Hand

- Product and system definition: `docs/design.md`.
- Architecture, API, operations, and security documentation in `docs/`.
- Approved landing and application prototypes in `docs/FinPal landing and app prototype/`.
- No customer testimonials, production transaction metrics, or live-payment claims are available and none should be fabricated.

## Product Principles

- Evaluate before paying.
- Fail closed when evidence or permission is insufficient.
- Make the same evidence produce the same outcome.
- Keep payment transitions precise and reversible until capture.
- Explain and audit every consequential step.

## Accessibility & Inclusion

The web experience must remain keyboard-operable, responsive, readable at mobile sizes, respectful of reduced-motion preferences, and explicit in status communication rather than relying on color alone.
