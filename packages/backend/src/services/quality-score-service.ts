import type { QualityScoreResult } from "@finpal/contracts";

import { scoreQuality } from "../domain/quality-score";
import type { ComparableOffersService } from "../use-cases/comparable-offers";

export interface ScoreProposalInput {
  productName: string;
  proposedPrice: number;
  currency: string;
}

export interface QualityScoreService {
  /** Looks up comparable offers, then scores the proposed price against them. */
  score(input: ScoreProposalInput): Promise<QualityScoreResult>;
}

export function createQualityScoreService(deps: {
  offers: Pick<ComparableOffersService, "lookup">;
}): QualityScoreService {
  return {
    async score(input) {
      const lookup = await deps.offers.lookup({
        query: input.productName,
        currency: input.currency.toUpperCase(),
      });
      return scoreQuality({
        proposedPrice: input.proposedPrice,
        currency: input.currency,
        lookup,
      });
    },
  };
}
