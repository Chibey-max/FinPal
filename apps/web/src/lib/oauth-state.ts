import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signed OAuth `state` that carries the FinPal user id so external providers
 * can redirect back to a host that does not have the Supabase session cookie
 * (e.g. HTTPS tunnel vs localhost).
 */
export function createOAuthState(userId: string, secret: string): string {
  const nonce = randomBytes(16).toString("base64url");
  const body = `${userId}.${nonce}`;
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Returns the user id when the signature is valid; otherwise null. */
export function parseOAuthState(state: string, secret: string): string | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [userId, nonce, sig] = parts;
  if (!userId || !nonce || !sig) return null;
  const body = `${userId}.${nonce}`;
  const expected = createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }
  return userId;
}
