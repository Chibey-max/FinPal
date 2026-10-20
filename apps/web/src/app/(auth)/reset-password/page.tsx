import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/features/auth/auth-forms";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New password · FinPal" };

/**
 * Reached from the reset email via /auth/callback, which exchanges the code
 * for a recovery session. Without that session the link has expired.
 */
export default async function ResetPasswordPage() {
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
