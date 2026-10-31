"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { isRateLimited } from "@/lib/api";
import { safeNextPath } from "@/lib/auth";
import { isMockMode } from "@/lib/data-source";
import { endSession, getAuthService, setSessionCookie } from "@/lib/session";

export interface AuthFormState {
  error?: string;
  message?: string;
  /** Which field the error is about, so the form can mark it invalid. */
  field?: "email" | "password";
}

const credentialsSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(72, "Use at most 72 characters."),
  next: z.string().optional(),
});

function parseCredentials(formData: FormData) {
  return credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
}

function firstIssue(error: z.ZodError): AuthFormState {
  const issue = error.issues[0];
  const field = issue?.path[0];
  return {
    error: issue?.message ?? "Check the form and try again.",
    field: field === "email" || field === "password" ? field : undefined,
  };
}

const TOO_MANY = "Too many attempts. Wait a few minutes and try again.";

export async function signIn(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = parseCredentials(formData);
  if (!parsed.success) return firstIssue(parsed.error);

  // Slows password guessing against one account (per server process).
  const key = `sign-in:${parsed.data.email.toLowerCase()}`;
  if (isRateLimited(key, 10, 15 * 60_000)) return { error: TOO_MANY };

  const session = await getAuthService().signIn(
    parsed.data.email,
    parsed.data.password,
  );
  if (!session) return { error: "That email and password don't match." };

  await setSessionCookie(session.token, session.expiresAt);
  redirect(safeNextPath(parsed.data.next));
}

export async function signUp(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = parseCredentials(formData);
  if (!parsed.success) return firstIssue(parsed.error);

  if (isRateLimited("sign-up", 30, 60 * 60_000)) return { error: TOO_MANY };

  const result = await getAuthService().signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    displayName: null,
  });
  if (!result.ok) {
    return result.reason === "EMAIL_TAKEN"
      ? {
          error: "An account with that email already exists. Sign in instead.",
          field: "email",
        }
      : { error: "Use at least 8 characters.", field: "password" };
  }

  await setSessionCookie(result.token, result.expiresAt);
  redirect(safeNextPath(parsed.data.next));
}

export async function signOut() {
  if (isMockMode()) redirect("/");
  await endSession();
  redirect("/login");
}
