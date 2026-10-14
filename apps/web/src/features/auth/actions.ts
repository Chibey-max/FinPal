"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { safeNextPath } from "@/lib/auth";
import { getPublicEnv } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface AuthFormState {
  error?: string;
  message?: string;
}

const credentialsSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  next: z.string().optional(),
});

function parseCredentials(formData: FormData) {
  return credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
}

export async function signIn(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = parseCredentials(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    return { error: error.message };
  }

  redirect(safeNextPath(parsed.data.next));
}

export async function signUp(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = parseCredentials(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${getPublicEnv().NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  if (error) {
    return { error: error.message };
  }

  // With email confirmation disabled (local dev), Supabase returns a session.
  if (data.session) {
    redirect(safeNextPath(parsed.data.next));
  }
  return { message: "Check your email to confirm your account." };
}

export async function signOut() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
