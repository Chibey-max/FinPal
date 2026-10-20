import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/features/auth/auth-forms";

export const metadata: Metadata = { title: "Reset password · FinPal" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
