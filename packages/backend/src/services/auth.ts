import {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

import type { SessionRepository } from "../repositories/session-repository";
import type {
  UserRecord,
  UserRepository,
} from "../repositories/user-repository";

// One of OWASP's equivalent scrypt settings; N=2^15 needs 32 MiB per hash
// (N=2^17 would need 128 MiB, too much for a small instance under load).
const SCRYPT = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 64;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

function deriveKey(
  password: string,
  salt: Buffer,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

/** `scrypt$N$r$p$salt$hash`, base64url; parameters travel with the hash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, SCRYPT);
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await deriveKey(password, Buffer.from(salt, "base64url"), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Sessions are stored by this hash, so a database leak exposes no tokens. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Verified against when the email is unknown, so a sign-in for a missing
// account takes as long as one with a wrong password.
let dummyHash: Promise<string> | undefined;

export interface SignedIn {
  user: UserRecord;
  token: string;
  expiresAt: Date;
}

export type SignUpResult =
  | ({ ok: true } & SignedIn)
  | { ok: false; reason: "EMAIL_TAKEN" | "WEAK_PASSWORD" };

export interface AuthService {
  signUp(input: {
    email: string;
    password: string;
    displayName: string | null;
  }): Promise<SignUpResult>;
  /** Null for an unknown email, wrong password or an account with no password. */
  signIn(email: string, password: string): Promise<SignedIn | null>;
  signOut(token: string): Promise<void>;
  /** The signed-in user for a cookie token, or null if missing or expired. */
  getUser(token: string): Promise<UserRecord | null>;
  /** Sets a password and signs the user out of every existing session. */
  setPassword(email: string, password: string): Promise<boolean>;
}

export interface AuthDeps {
  users: UserRepository;
  sessions: SessionRepository;
  clock?: () => Date;
}

export function createAuthService({
  users,
  sessions,
  clock = () => new Date(),
}: AuthDeps): AuthService {
  async function startSession(user: UserRecord): Promise<SignedIn> {
    const token = randomBytes(32).toString("base64url");
    const now = clock();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await sessions.create(hashSessionToken(token), user.id, expiresAt);
    // Opportunistic cleanup keeps the table small without a cron job.
    await sessions.deleteExpired(now);
    return { user, token, expiresAt };
  }

  return {
    async signUp({ email, password, displayName }) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        return { ok: false, reason: "WEAK_PASSWORD" };
      }
      if (await users.findByEmail(email)) {
        return { ok: false, reason: "EMAIL_TAKEN" };
      }
      try {
        const user = await users.create({
          email,
          passwordHash: await hashPassword(password),
          displayName,
        });
        return { ok: true, ...(await startSession(user)) };
      } catch (error) {
        if ((error as Error).name === "DuplicateEmailError") {
          return { ok: false, reason: "EMAIL_TAKEN" };
        }
        throw error;
      }
    },

    async signIn(email, password) {
      const user = await users.findByEmail(email);
      if (!user?.passwordHash) {
        dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
        await verifyPassword(password, await dummyHash);
        return null;
      }
      if (!(await verifyPassword(password, user.passwordHash))) return null;
      return startSession({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      });
    },

    async signOut(token) {
      await sessions.delete(hashSessionToken(token));
    },

    async getUser(token) {
      if (!token) return null;
      return sessions.findUser(hashSessionToken(token), clock());
    },

    async setPassword(email, password) {
      if (password.length < MIN_PASSWORD_LENGTH) return false;
      const user = await users.findByEmail(email);
      if (!user) return false;
      await users.setPasswordHash(user.id, await hashPassword(password));
      await sessions.deleteForUser(user.id);
      return true;
    },
  };
}
