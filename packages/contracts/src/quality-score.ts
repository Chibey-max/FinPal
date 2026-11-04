import { z } from "zod";

import { comparableOfferSchema, offerLookupStatusSchema } from "./offers";

export const qualityScoreSchema = z.enum([
  "GOOD",
  "FAIR",
  "POOR",
  "INSUFFICIENT_DATA",
]);

export type QualityScore = z.infer<typeof qualityScoreSchema>;

/**
 * Quality Score v1 thresholds (PRD section 5), as ratios to the median of
 * comparable offers. Both bounds are inclusive:
 *   GOOD  proposed <= median x 1.05
 *   FAIR  proposed <= median x 1.20
 *   POOR  proposed >  median x 1.20
 *   INSUFFICIENT_DATA  fewer than 3 usable offers or unusable currency data
 */
export const QUALITY_THRESHOLDS = {
  goodMaxRatio: 1.05,
  fairMaxRatio: 1.2,
} as const;

/**
 * Below this ratio a price is too good to take on trust: often a scam, a used
 * item or the wrong product. The score stays GOOD, but it goes to a person.
 */
export const UNUSUALLY_LOW_RATIO = 0.5;

/** The deterministic result persisted on each evaluation. */
export const qualityScoreResultSchema = z.object({
  score: qualityScoreSchema,
  explanation: z.string(),
  proposedPrice: z.number().positive(),
  currency: z.string().length(3),
  offerCount: z.number().int().nonnegative(),
  /** Null when there are too few offers to score. */
  medianPrice: z.number().nullable(),
  lowestPrice: z.number().nullable(),
  /** proposed / median, e.g. 1.04 means 4% above the median. */
  ratioToMedian: z.number().nullable(),
  /** Under UNUSUALLY_LOW_RATIO, computed exactly. Absent on older results. */
  unusuallyLow: z.boolean().optional(),
  thresholds: z.object({
    goodMaxRatio: z.number(),
    fairMaxRatio: z.number(),
  }),
  offerStatus: offerLookupStatusSchema,
  /** The Channel3 offers the score was computed from. */
  references: z.array(comparableOfferSchema),
});

export type QualityScoreResult = z.infer<typeof qualityScoreResultSchema>;
