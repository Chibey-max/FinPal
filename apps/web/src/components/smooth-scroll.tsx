"use client";

import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import type { ReactNode } from "react";

/**
 * Lenis smooth scrolling for the whole site (lenis.dev). It eases the
 * native window scroll, so scroll listeners, sticky elements and the hero
 * story keep working. Reduced motion is honoured by Lenis itself. Anything
 * that scrolls on its own (menus, dropdowns, dialogs, grids) opts out with
 * data-lenis-prevent.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  return (
    <ReactLenis
      root
      options={{
        autoRaf: true,
        lerp: 0.09,
        smoothWheel: true,
        // In-page links (#loop, #policy…) glide, landing below the floating nav.
        anchors: { offset: -88 },
        stopInertiaOnNavigate: true,
        prevent: (node) =>
          node.classList.contains("ag-body-viewport") ||
          node.tagName === "DIALOG",
      }}
    >
      {children}
    </ReactLenis>
  );
}
