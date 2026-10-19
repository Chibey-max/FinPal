"use client";

import { DarkModeIcon, LightModeIcon } from "./icons";
import type { MouseEvent } from "react";

type Theme = "dark" | "light";

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  try {
    localStorage.setItem("finpal-theme", theme);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies.
  }
}

/**
 * Round icon button. Which icon shows is pure CSS on html[data-theme] (set
 * before first paint), so it never flashes on load. The new theme is
 * revealed as a circle growing from the click point.
 */
export function ThemeToggle() {
  function toggle(event: MouseEvent<HTMLButtonElement>) {
    const next: Theme = currentTheme() === "light" ? "dark" : "light";
    if (
      !document.startViewTransition ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      applyTheme(next);
      return;
    }
    // Keyboard activation has no pointer position: reveal from the button.
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX || box.left + box.width / 2;
    const y = event.clientY || box.top + box.height / 2;
    const radius = Math.hypot(
      Math.max(x, innerWidth - x),
      Math.max(y, innerHeight - y),
    );
    const transition = document.startViewTransition(() => applyTheme(next));
    transition.ready
      .then(() =>
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${radius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 650,
            easing: "cubic-bezier(.65,.05,.25,1)",
            pseudoElement: "::view-transition-new(root)",
          },
        ),
      )
      .catch(() => undefined);
  }

  return (
    <button
      className="theme-button"
      type="button"
      onClick={toggle}
      aria-label="Toggle light and dark theme"
      title="Toggle theme"
    >
      <LightModeIcon className="theme-button__sun" />
      <DarkModeIcon className="theme-button__moon" />
    </button>
  );
}
