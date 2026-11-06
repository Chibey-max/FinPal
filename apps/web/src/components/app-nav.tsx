"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ExpandMoreIcon } from "./icons";

const scenarios = [
  {
    href: "/app/proposals/new?preset=auto",
    preset: "auto",
    label: "Auto-approve",
    hint: "All checks pass",
    tone: "ok",
  },
  {
    href: "/app/proposals/new?preset=review",
    preset: "review",
    label: "Needs review",
    hint: "Fair price, a person decides",
    tone: "warn",
  },
  {
    href: "/app/proposals/new?preset=blocked",
    preset: "blocked",
    label: "Blocked",
    hint: "Never creates a PayPal order",
    tone: "bad",
  },
  {
    href: "/app/send",
    preset: "send",
    label: "Send unclaimed",
    hint: "Demo email · Payouts accepted",
    tone: "ok",
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
    pathname === "/app/send"
      ? "send"
      : pathname === "/app/proposals/new"
        ? params.get("preset")
        : null;
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
            href={scenario.href}
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
