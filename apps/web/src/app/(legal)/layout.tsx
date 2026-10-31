import Link from "next/link";
import type { ReactNode } from "react";

import { ArrowBackIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

import "./legal.css";

/** Privacy and terms: public pages, readable by anyone without an account. */
export default function LegalLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="legal-shell">
      <header className="legal-top">
        <Link
          href="/"
          className="legal-home"
          aria-label="Back to the FinPal home page"
        >
          <ArrowBackIcon aria-hidden />
          <Logo size={24} />
        </Link>
        <ThemeToggle />
      </header>
      <main id="main" className="legal-main">
        <article className="legal-card">{children}</article>
        <nav className="legal-links" aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </main>
    </div>
  );
}
