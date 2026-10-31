import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/features/auth/auth-forms";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New password · FinPal" };

/**
 * Reached from the reset email. The token in the link is only used when the
 * form is submitted, so an email scanner opening the link can't use it up.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash: tokenHash, type } = await searchParams;
  if (tokenHash && type === "recovery") {
    return <ResetPasswordForm tokenHash={tokenHash} />;
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return (
      <div className="auth-card__body">
        <div className="auth-head">
          <h1>This link has expired</h1>
          <p>Reset links work once and expire after an hour.</p>
        </div>
        <Link href="/forgot-password" className="btn btn-outline">
          Request a new link
        </Link>
      </div>
    );
  }
  return <ResetPasswordForm />;
}
