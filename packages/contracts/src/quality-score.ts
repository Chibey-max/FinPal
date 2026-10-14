import { z } from "zod";

export const qualityScoreSchema = z.enum([
  "GOOD",
  "FAIR",
  "POOR",
  "INSUFFICIENT_DATA",
]);

export type QualityScore = z.infer<typeof qualityScoreSchema>;
