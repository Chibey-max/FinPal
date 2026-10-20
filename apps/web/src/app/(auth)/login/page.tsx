import type { Metadata } from "next";

import { LoginForm } from "@/features/auth/auth-forms";

export const metadata: Metadata = { title: "Sign in · FinPal" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; mode?: string }>;
}) {
  const { next, error, mode } = await searchParams;
  return (
    <LoginForm
      next={next}
      initialMode={mode === "signup" ? "signup" : "signin"}
      callbackError={Boolean(error)}
    />
  );
}
