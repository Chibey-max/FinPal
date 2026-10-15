import "server-only";

import {
  createChannel3HttpClient,
  createComparableOffersService,
  type ComparableOffersService,
} from "@finpal/backend";

import { getChannel3ApiKey } from "@/lib/env.server";

let service: ComparableOffersService | undefined;

export function getComparableOffersService(): ComparableOffersService {
  service ??= createComparableOffersService({
    channel3: createChannel3HttpClient({ apiKey: getChannel3ApiKey() }),
  });
  return service;
}
