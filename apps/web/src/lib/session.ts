import "server-only";

import {
  createAuthService,
  createPostgresSessionRepository,
  createPostgresUserRepository,
  type AuthService,
  type UserRecord,
} from "@finpal/backend";
import { cookies } from "next/headers";
import { cache } from "react";

import { getDb } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session-cookie";

let authService: AuthService | undefined;

export function getAuthService(): AuthService {
  if (authService) return authService;
  const db = getDb();
  authService = createAuthService({
    users: createPostgresUserRepository(db),
    sessions: createPostgresSessionRepository(db),
  });
  return authService;
}

/**
 * The signed-in user, looked up from the session cookie in the database.
 * cache(): the layout, page and route share one lookup per request. Reading
 * cookies also opts the route into dynamic rendering.
 */
export const getSessionUser = cache(async (): Promise<UserRecord | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? getAuthService().getUser(token) : null;
});

/** Server Functions and Route Handlers only: Server Components cannot set cookies. */
export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Ends the session in the database and removes the cookie. */
export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await getAuthService().signOut(token);
  store.delete(SESSION_COOKIE);
}
