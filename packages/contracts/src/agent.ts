import { z } from "zod";

import { assistantSourceSchema } from "./assistant";
import { timeWindowSchema } from "./constraints";
import { decisionSchema, evaluationSchema } from "./decision";
import { proposalSchema } from "./proposal";

/**
 * The shopping agent (Groq). It turns a need into a search, picks one of the
 * real Channel3 offers it found and submits the proposal. The deterministic
 * rules still decide the outcome, and payment still needs PayPal approval.
 */

export const agentShopRequestSchema = z.object({
  need: z.string().trim().min(3).max(300),
  /** Calendar event the need came from, if any. */
  eventId: z.string().max(200).optional(),
});

export type AgentShopRequest = z.infer<typeof agentShopRequestSchema>;

/** A shopping list in the user's own words, one or several items. */
export const agentListRequestSchema = z.object({
  list: z.string().trim().min(3).max(1000),
});

export const shoppingBriefSchema = z.object({
  /** What to search Channel3 for. */
  query: z.string(),
  /** Budget stated in the need, else null. */
  maxPrice: z.number().positive().nullable(),
  currency: z.string().length(3),
  /** Features the need asks for, used only to rank offers. */
  mustHaves: z.array(z.string()),
});

export type ShoppingBrief = z.infer<typeof shoppingBriefSchema>;

export const agentCandidateSchema = z.object({
  productId: z.string(),
  title: z.string(),
  merchant: z.string(),
  price: z.number().positive(),
  currency: z.string().length(3),
  url: z.string(),
});

export type AgentCandidate = z.infer<typeof agentCandidateSchema>;

export const agentRunStatusSchema = z.enum([
  /** A proposal was submitted and evaluated. */
  "PROPOSED",
  /** Too vague to buy; the agent asks `question` before searching. */
  "NEEDS_DETAIL",
  /** Channel3 found no usable offers for the search. */
  "NO_OFFERS",
  /** Offers exist, but none fit the budget. */
  "OVER_BUDGET",
  /** Channel3 could not be searched (outage or unsupported currency). */
  "SEARCH_FAILED",
]);

export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export const agentRunSchema = z.object({
  status: agentRunStatusSchema,
  need: z.string(),
  brief: shoppingBriefSchema,
  /** Offers the agent chose between, cheapest first. */
  candidates: z.array(agentCandidateSchema),
  /** Usable offers found before the budget filter. */
  offersFound: z.number().int().nonnegative(),
  pick: agentCandidateSchema.nullable(),
  /** Why the agent picked this offer, in plain words. */
  reason: z.string().nullable(),
  proposal: proposalSchema.nullable(),
  evaluation: evaluationSchema.nullable(),
  decision: decisionSchema.nullable(),
  /** What the agent needs to know, when status is NEEDS_DETAIL. */
  question: z.string().nullable(),
  /** Why an approved item is left out of the basket (not enough cap left). */
  hold: z.string().nullable(),
  source: assistantSourceSchema,
  model: z.string().nullable(),
});

export type AgentRun = z.infer<typeof agentRunSchema>;

export const agentListResultSchema = z.object({
  runs: z.array(agentRunSchema),
});

export type AgentListResult = z.infer<typeof agentListResultSchema>;

// ------------------------------------------------------- calendar agent

export const eventSuggestionSchema = z.object({
  /** Null when the idea comes from purchase history, not an event. */
  eventId: z.string().nullable(),
  eventTitle: z.string().nullable(),
  startsAt: z.string().nullable(),
  /** A need the user can hand to the shopping agent, e.g. "travel adapter". */
  need: z.string(),
  reason: z.string(),
});

export type EventSuggestion = z.infer<typeof eventSuggestionSchema>;

export const eventSuggestionsSchema = z.object({
  suggestions: z.array(eventSuggestionSchema),
  /** False when no calendar is connected. */
  calendarConfigured: z.boolean(),
  source: assistantSourceSchema,
  model: z.string().nullable(),
});

export type EventSuggestions = z.infer<typeof eventSuggestionsSchema>;

// ------------------------------------------------- natural-language rules

export const draftConstraintsRequestSchema = z.object({
  text: z.string().trim().min(3).max(500),
});

/** Only the fields the sentence mentions; null means "leave as is". */
export const constraintsDraftSchema = z.object({
  currency: z.string().length(3).nullable(),
  perPurchase: z.number().positive().max(1_000_000).nullable(),
  daily: z.number().positive().max(1_000_000).nullable(),
  monthly: z.number().positive().max(1_000_000).nullable(),
  timeWindows: z.array(timeWindowSchema).max(14).nullable(),
});

export type ConstraintsDraft = z.infer<typeof constraintsDraftSchema>;

export const draftConstraintsResultSchema = z.object({
  draft: constraintsDraftSchema,
  /** Which fields the sentence set, for highlighting in the form. */
  changed: z.array(
    z.enum(["currency", "perPurchase", "daily", "monthly", "timeWindows"]),
  ),
  source: assistantSourceSchema,
  model: z.string().nullable(),
});

export type DraftConstraintsResult = z.infer<
  typeof draftConstraintsResultSchema
>;

// ----------------------------------------------------- spending forecast

export const eventCategorySchema = z.enum([
  "TRAVEL",
  "CELEBRATION",
  "WORK",
  "OTHER",
]);

export type EventCategory = z.infer<typeof eventCategorySchema>;

export const forecastLevelSchema = z.enum(["OK", "WATCH", "WARN"]);

export const spendingForecastSchema = z.object({
  level: forecastLevelSchema,
  currency: z.string().length(3),
  spentToday: z.number(),
  spentThisMonth: z.number(),
  /** Spend this month at the current daily pace, or null early in the month. */
  projectedMonth: z.number().nullable(),
  dailyLeft: z.number().nullable(),
  monthlyLeft: z.number().nullable(),
  daysLeftInMonth: z.number().int(),
  /** Upcoming events (next 14 days) likely to involve spending. */
  busyEvents: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      startsAt: z.string(),
      category: eventCategorySchema,
    }),
  ),
  /** Short facts computed by the rules, e.g. "On pace for $1,240 of $1,000". */
  signals: z.array(z.string()),
  /** One or two sentences of advice; numbers only from `signals`. */
  advice: z.string(),
  source: assistantSourceSchema,
  model: z.string().nullable(),
});

export type SpendingForecast = z.infer<typeof spendingForecastSchema>;
