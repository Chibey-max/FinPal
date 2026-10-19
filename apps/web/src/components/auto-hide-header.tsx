"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A floating header that slides away while the page scrolls down and
 * slides back as soon as the user scrolls up (or reaches the top, or tabs
 * into it). Direction changes need a few pixels of travel so trackpad
 * jitter never makes it flicker.
 */
export function AutoHideHeader({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const [hidden, setHidden] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    let last = scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = Math.max(0, scrollY);
      const delta = y - last;
      if (y < 96) setHidden(false);
      else if (delta > 8)
        setHidden(!ref.current?.contains(document.activeElement));
      else if (delta < -8) setHidden(false);
      if (Math.abs(delta) > 8 || y < 96) last = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <header
      ref={ref}
      className={className}
      data-hidden={hidden || undefined}
      onFocusCapture={() => setHidden(false)}
    >
      {children}
    </header>
  );
}
