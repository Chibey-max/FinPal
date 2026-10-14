import type { QualityScore } from "@finpal/contracts";

export interface QualityScoreResult {
  score: QualityScore;
  explanation: string;
  medianPrice?: number;
  lowestPrice?: number;
  offerCount: number;
}

export interface QualityScoreService {
  evaluate(
    proposedPrice: number,
    offerPrices: readonly number[],
  ): QualityScoreResult;
}
