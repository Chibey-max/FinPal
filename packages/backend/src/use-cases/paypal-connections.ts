import { decryptToken, encryptToken } from "./calendar-connections";
import {
  exchangePaypalCode,
  paypalConsentUrl,
  revokePaypalToken,
} from "../integrations/paypal/paypal-oauth";
import type { PaypalConnectionRepository } from "../repositories/paypal-connection-repository";
import type { PaypalConnectionStatus } from "@finpal/contracts";

export interface PaypalConnectionDeps {
  connections: PaypalConnectionRepository;
  clientId: string;
  clientSecret: string;
  apiBaseUrl: string;
  redirectUri: string;
  fetch?: typeof fetch;
  onError?: (error: unknown) => void;
}

export type PaypalConnectionService = ReturnType<
  typeof createPaypalConnectionService
>;

export function createPaypalConnectionService(deps: PaypalConnectionDeps) {
  const { connections, clientId, clientSecret, apiBaseUrl, redirectUri } = deps;

  return {
    consentUrl: (state: string) =>
      paypalConsentUrl({
        clientId,
        clientSecret,
        apiBaseUrl,
        redirectUri,
        state,
      }),

    async complete(
      userId: string,
      code: string,
    ): Promise<PaypalConnectionStatus> {
      const identity = await exchangePaypalCode({
        clientId,
        clientSecret,
        apiBaseUrl,
        redirectUri,
        code,
        fetch: deps.fetch,
      });
      await connections.save(userId, {
        refreshTokenEncrypted: encryptToken(
          identity.refreshToken,
          clientSecret,
        ),
        payerId: identity.payerId,
        email: identity.email,
      });
      return {
        connected: true,
        email: identity.email,
        payerId: identity.payerId,
        needsReconnect: false,
      };
    },

    async status(userId: string): Promise<PaypalConnectionStatus> {
      const row = await connections.get(userId);
      if (!row) {
        return {
          connected: false,
          email: null,
          payerId: null,
          needsReconnect: false,
        };
      }
      return {
        connected: true,
        email: row.email,
        payerId: row.payerId,
        needsReconnect: row.needsReconnect,
      };
    },

    async disconnect(userId: string): Promise<void> {
      const row = await connections.get(userId);
      if (!row) return;
      try {
        await revokePaypalToken({
          apiBaseUrl,
          clientId,
          clientSecret,
          token: decryptToken(row.refreshTokenEncrypted, clientSecret),
          fetch: deps.fetch,
        });
      } catch (error) {
        deps.onError?.(error);
      }
      await connections.remove(userId);
    },

    /** Mock / tests: store a connection without hitting PayPal. */
    async connectMock(
      userId: string,
      input: { email: string; payerId: string; refreshToken?: string },
    ): Promise<PaypalConnectionStatus> {
      await connections.save(userId, {
        refreshTokenEncrypted: encryptToken(
          input.refreshToken ?? `mock-refresh-${userId}`,
          clientSecret,
        ),
        payerId: input.payerId,
        email: input.email,
      });
      return {
        connected: true,
        email: input.email,
        payerId: input.payerId,
        needsReconnect: false,
      };
    },
  };
}
