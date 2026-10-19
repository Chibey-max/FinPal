"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AutoHideHeader } from "./auto-hide-header";
import { CloseIcon, MenuIcon } from "./icons";
import { Logo } from "./logo";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { ThemeToggle } from "./theme-toggle";

const LINKS = [
  { id: "loop", label: "How it works" },
  { id: "policy", label: "Policy" },
  { id: "payments", label: "Payments" },
  { id: "safety", label: "Safety" },
] as const;

/** One floating pill: brand, section links, theme and the app entry. */
export function LandingNav() {
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Highlight the section that occupies the middle of the viewport.
  useEffect(() => {
    const sections = LINKS.map((link) =>
      document.getElementById(link.id),
    ).filter((node): node is HTMLElement => node !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
          else if (entry.target.id === active) setActive(null);
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [active]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    addEventListener("keydown", close);
    return () => removeEventListener("keydown", close);
  }, [open]);

  return (
    <AutoHideHeader className="landing-nav">
      <div className="landing-nav__bar" data-open={open || undefined}>
        <Link
          href="#top"
          className="landing-brand"
          onClick={() => setOpen(false)}
        >
          <Logo size={26} />
        </Link>
        <nav
          className="landing-nav__links"
          aria-label="Sections"
          id="landing-sections"
        >
          {LINKS.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              aria-current={active === link.id ? "true" : undefined}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="landing-nav__actions">
          <ThemeToggle />
          <button
            type="button"
            className="landing-nav__menu"
            aria-expanded={open}
            aria-controls="landing-sections"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
          <LiquidButton asChild size="default" className="rounded-full px-5">
            <Link href="/app">Open app</Link>
          </LiquidButton>
        </div>
      </div>
    </AutoHideHeader>
  );
}
