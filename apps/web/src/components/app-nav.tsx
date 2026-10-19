"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ExpandMoreIcon } from "./icons";
import { LinkPending } from "./navigation-feedback";

const navItems = [
  { href: "/app", label: "Overview", exact: true },
  { href: "/app/calendar", label: "Calendar" },
  { href: "/app/proposals/new", label: "New proposal" },
  { href: "/app/decisions", label: "Decisions" },
  { href: "/app/review", label: "Review queue", badge: "review" },
  { href: "/app/payments", label: "Payments", badge: "payments" },
  { href: "/app/activity", label: "Activity" },
  { href: "/app/constraints", label: "Constraints" },
] as const;

export interface NavBadges {
  review: number;
  payments: number;
}

export function AppNav({ badges }: { badges: NavBadges }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  // Keep the active pill visible when the nav scrolls horizontally.
  useEffect(() => {
    navRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  return (
    <nav ref={navRef} aria-label="Main" className="app-nav">
      {navItems.map((item) => {
        const active =
          pathname === item.href ||
          (!("exact" in item) && pathname.startsWith(`${item.href}/`));
        const count = "badge" in item ? badges[item.badge] : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
            <LinkPending />
            {count ? (
              <span className="nav-badge" aria-label={`${count} pending`}>
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

const scenarios = [
  {
    preset: "auto",
    label: "Auto-approve",
    hint: "All checks pass",
    tone: "ok",
  },
  {
    preset: "review",
    label: "Manual review",
    hint: "Fair price, needs a person",
    tone: "warn",
  },
  {
    preset: "blocked",
    label: "Blocked",
    hint: "Over cap and a poor price",
    tone: "bad",
  },
] as const;

/**
 * "Demo path" as a compact popover: each entry loads a preset on New
 * proposal. Keeps the top bar on one row.
 */
export function DemoPath() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active =
    pathname === "/app/proposals/new" ? params.get("preset") : null;
  const current = scenarios.find((s) => s.preset === active);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !ref.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    addEventListener("pointerdown", close);
    addEventListener("keydown", close);
    return () => {
      removeEventListener("pointerdown", close);
      removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="demo-menu" ref={ref}>
      <button
        type="button"
        className="demo-menu__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="demo-menu__dot" data-tone={current?.tone ?? "muted"} />
        <span className="demo-menu__label">
          {current ? current.label : "Demo path"}
        </span>
        <ExpandMoreIcon />
      </button>
      <div
        className="demo-menu__panel"
        role="menu"
        data-open={open || undefined}
      >
        <span className="demo-menu__title">Demo path</span>
        {scenarios.map((scenario) => (
          <Link
            key={scenario.preset}
            role="menuitem"
            href={`/app/proposals/new?preset=${scenario.preset}`}
            data-tone={scenario.tone}
            aria-current={active === scenario.preset ? "true" : undefined}
            onClick={() => setOpen(false)}
          >
            <span className="demo-menu__dot" />
            <span className="demo-menu__text">
              <b>{scenario.label}</b>
              <small>{scenario.hint}</small>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
