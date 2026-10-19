import "server-only";

import {
  createChannel3HttpClient,
  createComparableOffersService,
  type ComparableOffersService,
} from "@finpal/backend";

import { isMockMode } from "@/lib/data-source";
import { getChannel3ApiKey } from "@/lib/env.server";
import { mockBackend } from "@/lib/mock";

let service: ComparableOffersService | undefined;

export function getComparableOffersService(): ComparableOffersService {
  if (isMockMode()) return mockBackend.offers;
  service ??= createComparableOffersService({
    channel3: createChannel3HttpClient({ apiKey: getChannel3ApiKey() }),
  });
  return service;
}
