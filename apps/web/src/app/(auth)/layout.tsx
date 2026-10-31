import Link from "next/link";
import type { ReactNode } from "react";

import { ArrowBackIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

import "./auth.css";

/** Sign in, sign up and password reset: one glass card over the backdrop. */
export default function AuthLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="auth-shell">
      <header className="auth-top">
        <Link
          href="/"
          className="auth-home"
          aria-label="Back to the FinPal home page"
        >
          <ArrowBackIcon aria-hidden />
          <Logo size={24} />
        </Link>
        <ThemeToggle />
      </header>
      <main id="main" className="auth-main">
        <div className="auth-card">{children}</div>
        <p className="auth-note">
          PayPal Sandbox only. No real money moves. Not financial advice.{" "}
          <Link href="/privacy">Privacy</Link> ·{" "}
          <Link href="/terms">Terms</Link>
        </p>
      </main>
    </div>
  );
}
