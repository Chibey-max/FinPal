import type { UserRecord } from "./user-repository";

// Sessions are looked up by the SHA-256 of the cookie token; the token itself
// is never stored.
export interface SessionRepository {
  create(tokenHash: string, userId: string, expiresAt: Date): Promise<void>;
  /** The session's user while the session is unexpired at `now`. */
  findUser(tokenHash: string, now: Date): Promise<UserRecord | null>;
  delete(tokenHash: string): Promise<void>;
  /** Signs the user out everywhere, e.g. after a password change. */
  deleteForUser(userId: string): Promise<void>;
  deleteExpired(now: Date): Promise<void>;
}
