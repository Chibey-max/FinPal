"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AutoHideHeader } from "./auto-hide-header";
import {
  CloseIcon,
  CreditCardIcon,
  DescriptionIcon,
  MenuBookIcon,
  MenuIcon,
  VerifiedUserIcon,
} from "./icons";
import { Logo } from "./logo";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { ThemeToggle } from "./theme-toggle";

const LINKS = [
  // `short` and `Icon` are for the phone's bottom bar, where there is less room.
  { id: "loop", label: "How it works", short: "How to", Icon: MenuBookIcon },
  { id: "policy", label: "Policy", short: "Policy", Icon: DescriptionIcon },
  {
    id: "payments",
    label: "Payments",
    short: "Payments",
    Icon: CreditCardIcon,
  },
  { id: "safety", label: "Safety", short: "Safety", Icon: VerifiedUserIcon },
] as const;

/**
 * One floating pill: brand, section links, theme and the app entry. On phones
 * the section links move to a bottom bar and the header keeps the brand, the
 * theme toggle and the app entry.
 */
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
    <>
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
      {/* Phones only (landing.css). Outside the header: its hide-on-scroll
          transform would otherwise carry this bar away with it. */}
      <nav className="landing-bottom-nav" aria-label="Sections">
        {/* The same circling edge line as the Open app button. */}
        <span aria-hidden className="beam-ring" />
        {LINKS.map((link) => (
          <a
            key={link.id}
            href={`#${link.id}`}
            aria-current={active === link.id ? "true" : undefined}
          >
            <link.Icon size={22} />
            <span>{link.short}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
