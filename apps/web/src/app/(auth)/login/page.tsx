import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/features/auth/auth-forms";
import { isMockMode } from "@/lib/data-source";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in · FinPal" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: string }>;
}) {
  // Checked here rather than in the proxy: a stale cookie must reach the form,
  // not bounce between /login and /app.
  if (isMockMode() || (await getSessionUser())) redirect("/app");
  const { next, mode } = await searchParams;
  return (
    <LoginForm
      next={next}
      initialMode={mode === "signup" ? "signup" : "signin"}
    />
  );
}
