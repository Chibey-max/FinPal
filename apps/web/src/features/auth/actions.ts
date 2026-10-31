"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { safeNextPath } from "@/lib/auth";
import { getPublicEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface AuthFormState {
  error?: string;
  message?: string;
  /** Which field the error is about, so the form can mark it invalid. */
  field?: "email" | "password" | "confirm";
  /** The reset link has been used: this session finishes the reset. */
  linkUsed?: boolean;
}

const email = z.email("Enter a valid email address.");
const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use at most 72 characters.");

const credentialsSchema = z.object({
  email,
  password,
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
    field:
      field === "email" || field === "password" || field === "confirm"
        ? field
        : undefined,
  };
}

// Supabase's wording is technical; these read better on the form.
function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) {
    return "That email and password don't match.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Confirm your email first. We sent you a link when you signed up.";
  }
  if (/already registered|already been registered/i.test(message)) {
    return "An account with that email already exists. Sign in instead.";
  }
  if (/rate limit|too many/i.test(message)) {
    return "Too many attempts. Wait a minute and try again.";
  }
  return message;
}

export async function signIn(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = parseCredentials(formData);
  if (!parsed.success) return firstIssue(parsed.error);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { error: friendlyAuthError(error.message) };

  redirect(safeNextPath(parsed.data.next));
}

export async function signUp(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = parseCredentials(formData);
  if (!parsed.success) return firstIssue(parsed.error);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${getPublicEnv().NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  if (error) return { error: friendlyAuthError(error.message) };

  // With email confirmation disabled (local dev), Supabase returns a session.
  if (data.session) redirect(safeNextPath(parsed.data.next));
  return {
    message: `Check ${parsed.data.email} for a confirmation link to finish signing up.`,
  };
}

/**
 * Emails a password reset link. Answers the same way whether or not the
 * address has an account, so the form cannot be used to discover accounts.
 */
export async function requestPasswordReset(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: "Enter a valid email address.", field: "email" };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${getPublicEnv().NEXT_PUBLIC_APP_URL}/reset-password`,
  });
  if (error && /rate limit|too many/i.test(error.message)) {
    return { error: friendlyAuthError(error.message) };
  }
  if (error) console.error("Password reset request failed", error.message);

  return {
    message: `If ${parsed.data} has an account, a reset link is on its way. It expires in an hour.`,
  };
}

const newPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((value) => value.password === value.confirm, {
    message: "The passwords don't match.",
    path: ["confirm"],
  });

const EXPIRED = "This reset link has expired. Request a new one to continue.";

/**
 * Sets a new password. The email's token is only used here, when the person
 * submits, not when the link opens: email scanners open links, which would
 * otherwise use it up and show "expired" to the real person.
 */
export async function updatePassword(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return firstIssue(parsed.error);

  const supabase = await createServerSupabaseClient();
  const tokenHash = formData.get("tokenHash");
  if (typeof tokenHash === "string" && tokenHash) {
    // Never fall back to an existing session here: the password would change
    // on whichever account is signed in, not the one the link was sent to.
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });
    if (error) return { error: EXPIRED };
  } else {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { error: EXPIRED };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return {
      error: friendlyAuthError(error.message),
      field: "password",
      linkUsed: true,
    };
  }

  redirect("/app?password=updated");
}
