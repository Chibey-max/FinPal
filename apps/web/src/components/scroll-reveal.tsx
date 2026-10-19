"use client";

import { useEffect } from "react";

/**
 * Lenis-style reveals: elements marked data-reveal ease up out of a soft
 * blur the first time they enter the viewport. Content is only hidden once
 * this runs (html.reveal-ready), so it is never lost without JavaScript.
 */
export function ScrollReveal() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    const nodes = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.revealed = "true";
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
    nodes.forEach((node) => observer.observe(node));
    root.classList.add("reveal-ready");
    return () => {
      observer.disconnect();
      root.classList.remove("reveal-ready");
    };
  }, []);
  return null;
}
