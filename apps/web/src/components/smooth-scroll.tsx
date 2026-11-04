"use client";

import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import { useSyncExternalStore, type ReactNode } from "react";

import { isIosDevice } from "@/lib/ios-perf";

const subscribe = () => () => undefined;
const getIos = () => isIosDevice();
const getServerIos = () => false;

/**
 * Lenis smooth scrolling for desktop (lenis.dev). On iOS we keep Safari's
 * native momentum scroll — Lenis + WebGL + blur was hitching the landing hero.
 * Nested scrollers opt out with data-lenis-prevent.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const ios = useSyncExternalStore(subscribe, getIos, getServerIos);

  if (ios) return children;

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
        prevent: (node) => {
          if (!(node instanceof Element)) return false;
          return Boolean(
            node.closest("[data-lenis-prevent]") ||
              node.closest(".ag-body-viewport") ||
              node.closest(".agent-chat__thread") ||
              node.closest("dialog"),
          );
        },
      }}
    >
      {children}
    </ReactLenis>
  );
}
