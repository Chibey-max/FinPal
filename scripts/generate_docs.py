from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
BLUE = colors.HexColor("#0645AD")
NAVY = colors.HexColor("#063B86")
LIGHT_BLUE = colors.HexColor("#EAF2FF")
LIGHT_GREY = colors.HexColor("#F5F7FA")
TEXT = colors.HexColor("#20242A")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleBlue", parent=styles["Title"], textColor=BLUE, fontSize=22, leading=26, alignment=TA_CENTER, spaceAfter=8))
styles.add(ParagraphStyle(name="Subtitle", parent=styles["Normal"], fontSize=11, leading=15, alignment=TA_CENTER, textColor=colors.HexColor("#555B66")))
styles.add(ParagraphStyle(name="H1Blue", parent=styles["Heading1"], textColor=BLUE, fontSize=14, leading=17, spaceBefore=10, spaceAfter=6, keepWithNext=True))
styles.add(ParagraphStyle(name="H2Blue", parent=styles["Heading2"], textColor=NAVY, fontSize=11, leading=14, spaceBefore=8, spaceAfter=4, keepWithNext=True))
styles.add(ParagraphStyle(name="BodySmall", parent=styles["BodyText"], textColor=TEXT, fontSize=8.4, leading=11.2, spaceAfter=4))
styles.add(ParagraphStyle(name="BulletSmall", parent=styles["BodyText"], textColor=TEXT, fontSize=8.2, leading=10.8, leftIndent=12, firstLineIndent=-6, bulletIndent=4, spaceAfter=2))
styles.add(ParagraphStyle(name="TableHead", parent=styles["BodyText"], textColor=colors.white, fontSize=7.1, leading=8.5, alignment=TA_CENTER))
styles.add(ParagraphStyle(name="TableCell", parent=styles["BodyText"], textColor=TEXT, fontSize=7.1, leading=8.6))
styles.add(ParagraphStyle(name="Footer", parent=styles["Normal"], textColor=colors.HexColor("#737A84"), fontSize=7, alignment=TA_CENTER))


def p(text, style="BodySmall"):
    return Paragraph(text, styles[style])


def bullets(items):
    return [Paragraph(f"- {item}", styles["BulletSmall"]) for item in items]


def table(headers, rows, widths=None):
    data = [[Paragraph(str(v), styles["TableHead"]) for v in headers]]
    data.extend([[Paragraph(str(v), styles["TableCell"]) for v in row] for row in rows])
    t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#B8C2D1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GREY]),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#737A84"))
    canvas.drawCentredString(letter[0] / 2, 0.34 * inch, f"FinPal | 14 October 2026 | Page {doc.page}")
    canvas.restoreState()


def document(path, title, story):
    doc = SimpleDocTemplate(
        str(path), pagesize=letter, rightMargin=0.62 * inch, leftMargin=0.62 * inch,
        topMargin=0.58 * inch, bottomMargin=0.55 * inch,
        title=title, author="FinPal Team", subject="PayPal AI Hackathon planning",
    )
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def title_page(title, subtitle, detail):
    return [
        Spacer(1, 1.65 * inch), p(title, "TitleBlue"), p(subtitle, "Subtitle"),
        Spacer(1, 0.35 * inch), p(detail, "Subtitle"), Spacer(1, 1.9 * inch),
        p("Team: Dave - Henry (Frontend) - Celestine & Steph (Backend)", "Subtitle"), PageBreak(),
    ]


def build_prd():
    s = title_page("FinPal", "Financial Agent Buddy - Product Requirements Document", "PayPal AI Hackathon | Deadline: 12 November 2026")
    s += [p("1. Product Overview", "H1Blue"), p("FinPal is an agentic financial assistant built on PayPal Sandbox. It turns user-created purchase proposals and calendar context into constrained, safety-checked spending. It checks permission, purchase value, and merchant trust, then leaves an auditable decision record."), p("<b>Positioning:</b> An AI agent that spends within your rules, verifies value using market data, checks the merchant, and leaves a record that can be reviewed or reversed through the correct PayPal operation."),
          p("2. Goals and Scope", "H1Blue"), p("The hackathon goal is a polished end-to-end prototype: proposal, constraints, deterministic quality score, decision, PayPal authorization/capture, and audit history."), *bullets(["Must: PayPal Sandbox, Channel3, AG Grid, constraints, decision orchestration, and append-only audit events.", "Should: Bryntum Calendar and a basic KERNEL merchant trust check.", "Extra only after the core loop works: Elastic, Astropods, Postman automation, Zapier, and additional timelines.", "Sandbox-only: centrally configured merchant credentials; no user PayPal OAuth."]),
          p("3. Locked Technical Decisions", "H1Blue"), table(["Area", "Decision", "Implementation note"], [
              ["Application", "Next.js App Router monorepo", "Use Next.js route handlers/API routes; no FastAPI."],
              ["Authentication", "Supabase Auth", "Supabase also provides Postgres and per-user access control."],
              ["Frontend", "React, Tailwind, shadcn/ui", "AG Grid is the primary audit and transaction dashboard."],
              ["Payments", "PayPal Sandbox", "Central merchant credentials from environment variables only."],
              ["Deployment", "Render backend/API", "Frontend may use Vercel or Render; Render is the backend source of truth."],
              ["Calendar", "Google Calendar plus Bryntum", "Calendar events prefill proposals; they do not infer products."],
              ["Product data", "Channel3", "Deterministic scoring uses comparable offers."],
              ["Merchant trust", "KERNEL basic check", "A pass/fail/unavailable signal is sufficient for v1."],
          ], [0.9*inch, 1.55*inch, 4.1*inch]),
          p("4. Core User Flow", "H1Blue"), *bullets(["User signs in with Supabase Auth and configures time windows and amount caps.", "User manually creates a proposal or clicks Create proposal from event. Calendar data only prefills title and date.", "User supplies product name, proposed price, and currency.", "The API runs constraints, Channel3 Quality Score v1, and optional merchant trust checks.", "The decision matrix returns AUTO_APPROVE, MANUAL_REVIEW, or BLOCK with reasons.", "An approved decision creates a PayPal order and authorization. Capture occurs only after final approval.", "An AUTHORIZED payment can be VOIDED. A CAPTURED payment can only be REFUNDED if refunds are implemented.", "Every transition is appended to audit_events and displayed in AG Grid."]),
          PageBreak(), p("5. Quality Score v1", "H1Blue"), p("The score is deterministic. An LLM may explain the result but must not choose or change the category."), table(["Condition", "Score", "Approval implication"], [
              ["At least 3 comparable offers and proposed price <= median x 1.05", "Good", "Eligible for auto-approval if all other checks pass."],
              ["At least 3 offers and proposed price <= median x 1.20", "Fair", "Manual review; merchant trust must pass."],
              ["At least 3 offers and proposed price > median x 1.20", "Poor", "Block."],
              ["Fewer than 3 comparable offers or unusable currency data", "Insufficient data", "Manual review; never auto-approve."],
          ], [3.4*inch, 1.1*inch, 2.1*inch]), p("<b>Inputs:</b> proposed price, offer prices, and currency. Normalize or reject mismatched currencies before calculating the median. Store the category, explanation, offer count, median, lowest offer, currency, and Channel3 references used. Thresholds must also appear in code comments and tests."),
          p("6. Approval Decision Table v1", "H1Blue"), table(["Constraints", "Quality", "Trust", "Amount", "Result"], [
              ["Pass", "Good", "Pass or N/A", "Under cap", "Auto-approve"],
              ["Pass", "Fair", "Pass", "Under cap", "Manual review"],
              ["Fail", "Any", "Any", "Any", "Block"],
              ["Any", "Poor", "Any", "Any", "Block"],
              ["Any", "Any", "Any", "Over cap", "Block"],
              ["Any", "Insufficient data", "Any", "Any", "Manual review"],
          ], [1.15*inch, 1.35*inch, 1.35*inch, 1.25*inch, 1.45*inch]), p("Precedence: any explicit block condition wins. Otherwise insufficient data routes to manual review. Auto-approval requires every auto-approval condition to pass."),
          p("7. PayPal Payment State Model", "H1Blue"), table(["From", "Operation", "To", "Rule"], [
              ["-", "Create order", "CREATED", "Persist PayPal order ID and idempotency key."],
              ["CREATED", "Buyer/order approval", "APPROVED", "Record approval before authorization."],
              ["APPROVED", "Authorize", "AUTHORIZED", "Funds are authorized but not captured."],
              ["AUTHORIZED", "Capture", "CAPTURED", "Capture only after final approval."],
              ["AUTHORIZED", "Void", "VOIDED", "Void is valid only before capture."],
              ["CAPTURED", "Refund (optional)", "REFUNDED", "Never label this operation as void."],
          ], [1.05*inch, 1.25*inch, 1.15*inch, 3.05*inch]), p("The UI, API payloads, payment_attempts table, and audit events must use these exact uppercase states."),
          p("8. Minimal Data Model", "H1Blue"), table(["Table", "Required fields / behavior"], [
              ["users", "Supabase Auth identity/profile reference."],
              ["constraints", "user_id, time_windows, amount_caps, currency, created_at, updated_at."],
              ["proposals", "user_id, product_name, proposed_price, currency, source, source_event_id, proposed_for."],
              ["evaluations", "proposal_id, quality_score, explanation, Channel3 references and prices, trust_signal."],
              ["decisions", "evaluation_id, outcome, reason, decided_at, reviewer_id when manual."],
              ["payment_attempts", "decision_id, PayPal order/authorization/capture IDs, status, amount, idempotency_key."],
              ["audit_events", "append-only: user_id, entity_type, entity_id, type, payload, created_at."],
          ], [1.35*inch, 5.2*inch]),
          PageBreak(), p("9. Security and Operations", "H1Blue"), *bullets(["Keep sandbox credentials and all third-party secrets in environment variables; never expose them to the browser or commit them.", "Require an idempotency key for payment creation and reject conflicting replays.", "Make audit_events insert-only for application roles; corrections are new events, not updates or deletes.", "Use Supabase row-level security so users can access only their own proposals, evaluations, decisions, and constraints.", "If PayPal webhooks are included, verify signatures and make handlers idempotent. Webhooks are optional for the demo.", "Store third-party request IDs and sanitized responses for troubleshooting; never log secrets."]),
          p("10. Feature Priorities and Ownership", "H1Blue"), table(["Priority", "Feature", "Owner"], [
              ["P0", "Next.js/Supabase foundation and Auth", "Frontend + Backend"], ["P0", "PayPal authorization, capture, and void", "Backend"], ["P0", "Constraints and decision matrix", "Backend"], ["P0", "Channel3 Quality Score v1", "Backend"], ["P0", "Append-only audit log and AG Grid dashboard", "Backend + Frontend"], ["P1", "Manual approval flow", "Frontend + Backend"], ["P1", "Calendar proposal prefill and Bryntum view", "Frontend + Backend"], ["P1", "Basic KERNEL merchant trust signal", "Backend"], ["P2", "Refund, Elastic, Astropods, Zapier, extra timeline", "Only if core is stable"],
          ], [0.7*inch, 4.0*inch, 1.85*inch]),
          p("11. Definition of Done", "H1Blue"), *bullets(["A user signs in, creates constraints, and manually creates a proposal or prefills one from a calendar event.", "The proposal runs constraints and Quality Score v1, showing reference prices and an explanation.", "The decision matrix visibly produces auto-approve, manual review, or block.", "An approved sandbox order progresses through the exact PayPal states and can be voided while AUTHORIZED.", "All decisions and payment transitions appear in a filterable AG Grid audit dashboard.", "The public repository includes setup instructions, .env.example, schema/migrations, tests for scoring and decision rules, and sandbox-only disclosures.", "A sub-three-minute demo shows one successful purchase and at least one blocked or reviewed proposal."]),
          p("12. Explicitly Out of Scope", "H1Blue"), *bullets(["User PayPal OAuth, live payments, product inference from calendar text, multi-calendar support, behavioral duress detection, biometrics, crypto address masking, broad conversational BI, and complex multi-agent orchestration."]),
          p("13. Success for Judges", "H1Blue"), p("Within three minutes, a judge should see that FinPal evaluates value and safety, enforces user-defined limits, uses PayPal authorization correctly, and preserves a transparent decision trail. Sponsor tools should support that loop rather than appear as disconnected extras."),
          p("Document version: 14 October 2026 - Locked architecture and v1 specifications", "Footer")]
    document(DOCS / "FinPal_PRD.pdf", "FinPal Product Requirements Document", s)


def build_plan():
    s = [p("FinPal - 20-Day Detailed Build Plan", "TitleBlue"), p("PayPal AI Hackathon | 15 October - 3 November core build | Submission: 12 November 2026", "Subtitle"), p("Team: Dave + Henry (Frontend) - Celestine & Steph (Backend)", "Subtitle"), Spacer(1, 0.18*inch), p("Locked stack: Next.js App Router monorepo, Supabase Auth/Postgres, PayPal Sandbox central merchant credentials, Channel3, AG Grid, and Render for backend/API. Bryntum and KERNEL are P1. No FastAPI and no user PayPal OAuth."), p("Delivery rule", "H2Blue"), p("The core loop is proposal -> constraints -> Quality Score -> decision -> authorization/capture -> audit. Do not begin extra sponsor integrations until that loop is stable."),
          p("Day 1 - Foundation (Thu 15 Oct)", "H1Blue"), *bullets(["Create the Next.js monorepo, Tailwind/shadcn shell, shared domain types, linting, tests, README, and .env.example.", "Create Supabase project, Auth flow, initial migrations, row-level-security plan, and Render service.", "Provision central PayPal Sandbox merchant credentials and Channel3 access. Agree on API contracts and daily sync."]),
          p("Day 2 - PayPal State Model (Fri 16 Oct)", "H1Blue"), *bullets(["Implement CREATED -> APPROVED -> AUTHORIZED using idempotent route handlers.", "Persist PayPal IDs and exact uppercase states. Add void from AUTHORIZED; never call a post-capture reversal a void.", "Build settings/navigation skeleton and sandbox disclosure."]),
          p("Day 3 - Constraints and Schema (Sat 17 Oct)", "H1Blue"), *bullets(["Create users, constraints, proposals, evaluations, decisions, payment_attempts, and append-only audit_events migrations.", "Implement time-window and amount-cap checks with unit tests.", "Build the constraint settings form."]),
          p("Day 4 - Audit Foundation (Sun 18 Oct)", "H1Blue"), *bullets(["Create the insert-only audit service and entity event taxonomy.", "Enforce RLS and expose a user-scoped decisions/activity endpoint.", "Build an initial activity list before AG Grid integration."]),
          p("Day 5 - Channel3 Data (Mon 19 Oct)", "H1Blue"), *bullets(["Integrate product search and normalized comparable offers.", "Handle currency mismatch, fewer than three offers, timeouts, and provider errors.", "Display raw reference offers on a test page."]),
          p("Day 6 - Quality Score v1 (Tue 20 Oct)", "H1Blue"), *bullets(["Implement deterministic thresholds: Good <= median x 1.05; Fair <= median x 1.20; otherwise Poor.", "Return Insufficient data for fewer than three usable offers and prevent auto-approval.", "Persist median, lowest offer, offer count, currency, references, and explanation. Add boundary tests."]),
          p("Day 7 - Decision Orchestrator (Wed 21 Oct)", "H1Blue"), *bullets(["Implement the locked decision table and block-precedence rules.", "Return AUTO_APPROVE, MANUAL_REVIEW, or BLOCK with structured reasons.", "Build the approval screen prototype."]),
          p("Day 8 - End-to-End Slice (Thu 22 Oct)", "H1Blue"), *bullets(["Manual proposal -> evaluation -> decision -> PayPal authorization -> capture/void -> audit dashboard.", "Demonstrate happy path plus over-cap, Poor, and Insufficient data cases.", "Stop and resolve blockers before starting P1 work."]),
          p("Day 9 - AG Grid Dashboard (Fri 23 Oct)", "H1Blue"), *bullets(["Replace the temporary activity list with AG Grid.", "Show proposal, score, decision, exact payment status, amount, explanation, and timestamps."]),
          p("Day 10 - Dashboard and Resilience (Sat 24 Oct)", "H1Blue"), *bullets(["Add filters, sorting, badges, detail drawer, empty/error states, and loading behavior.", "Test duplicate payment requests and third-party failures. Begin Google Calendar OAuth only after core checks pass."]),
          p("Day 11 - Calendar Proposal Prefill (Sun 25 Oct)", "H1Blue"), *bullets(["Read one Google Calendar source and add Create proposal from event.", "Prefill event title/date only; the user supplies product name and proposed price. Do not infer products."]),
          p("Day 12 - Bryntum Calendar (Mon 26 Oct)", "H1Blue"), *bullets(["Visualize spending windows and calendar events in Bryntum.", "Link events to the proposal prefill action; preserve the manual flow as fallback."]),
          p("Day 13 - KERNEL Trust Check (Tue 27 Oct)", "H1Blue"), *bullets(["Implement a basic pass/fail/unavailable merchant signal with timeout behavior.", "Persist evidence/reference metadata and show the signal in evaluation details."]),
          p("Day 14 - Manual Approval (Wed 28 Oct)", "H1Blue"), *bullets(["Complete approve/reject UI for Fair and Insufficient data results.", "Ensure final approval gates authorization/capture and rejection is audited."]),
          p("Day 15 - Integration Day (Thu 29 Oct)", "H1Blue"), *bullets(["Run the complete decision matrix and exact payment-state transitions.", "Test cap boundaries, currency mismatch, duplicate requests, provider timeouts, void after authorization, and blocked capture."]),
          p("Day 16 - UI and Error Polish (Fri 30 Oct)", "H1Blue"), *bullets(["Polish responsive states, accessibility, errors, loading, and judge-facing explanations.", "Freeze features. Refund and all extra integrations remain out unless the core is fully stable."]),
          p("Day 17 - Demo Rehearsal (Sat 31 Oct)", "H1Blue"), *bullets(["Record raw footage showing one successful authorization/capture and one block/manual review.", "Verify audit records and sponsor-tool visibility. Bug fixes only."]),
          p("Day 18 - Documentation (Sun 1 Nov)", "H1Blue"), *bullets(["Finish README, .env.example, migration/setup steps, architecture diagram, sandbox disclosure, and API examples.", "Document Quality Score thresholds, decision table, state machine, and known limitations."]),
          p("Day 19 - Deploy and Package (Mon 2 Nov)", "H1Blue"), *bullets(["Test the Render backend/API deployment and chosen frontend host.", "Finalize a sub-three-minute video and Devpost text. Name only integrations actually demonstrated."]),
          p("Day 20 - Core Freeze (Tue 3 Nov)", "H1Blue"), *bullets(["Full team review, smoke test, backup demo recording, and submission checklist.", "Use the remaining buffer through 12 November for reliability, documentation, and submission - no speculative features."]),
          p("Ownership", "H1Blue"), table(["Owner", "Primary responsibility"], [["Dave", "Scope control, coordination, demo narrative, video, and Devpost."], ["Henry", "Next.js UI, AG Grid, Bryntum, settings, approval flow, and polish."], ["Celestine & Steph", "Supabase schema/Auth support, constraints, PayPal, Channel3, orchestration, audit, KERNEL, and Render deployment."]], [1.35*inch, 5.2*inch]),
          p("Critical gates", "H1Blue"), table(["Gate", "Required result"], [["End Day 3", "Schema, Auth, constraints tests, and PayPal state contract agreed."], ["End Day 6", "Quality Score v1 implemented with boundary and insufficient-data tests."], ["End Day 8", "Working manual end-to-end slice. P1 work is blocked until this passes."], ["End Day 15", "Decision matrix and payment transitions pass integration tests."], ["End Day 16", "Feature freeze; only fixes, docs, deployment, and demo work."], ["3-12 Nov", "Submission buffer and reliability work; final deadline is 12 Nov at 9:00 PM Lagos time."]], [1.35*inch, 5.2*inch]), p("Document version: 14 October 2026 - Locked implementation plan", "Footer")]
    document(DOCS / "FinPal_20Day_Build_Plan.pdf", "FinPal 20-Day Build Plan", s)


if __name__ == "__main__":
    DOCS.mkdir(parents=True, exist_ok=True)
    build_prd()
    build_plan()
