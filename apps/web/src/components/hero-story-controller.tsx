"use client";

import { useEffect, useRef } from "react";

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (value: number) => value * value * (3 - 2 * value);

/**
 * Drives the "card story" hero from scroll progress (handoff timings).
 * Every element is centred by CSS; this only writes one transform per
 * layer, so nothing is ever translated twice:
 *   .card-zoom  scroll zoom      .card-tilt  pointer tilt
 *   .finpal-card idle float (CSS animation)
 * The shared liquid backdrop zooms through --backdrop-scale on <html>.
 */
export function HeroStoryController() {
  const markerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const story = markerRef.current?.closest<HTMLElement>(".hero-story");
    if (!story) return;
    const root = document.documentElement;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const get = (name: string) =>
      story.querySelector<HTMLElement>(`[data-story="${name}"]`);
    const set = (name: string, styles: Partial<CSSStyleDeclaration>) => {
      const node = get(name);
      if (node) Object.assign(node.style, styles);
    };

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = story.getBoundingClientRect();
      const progress = reduceMotion
        ? 0
        : clamp(-rect.top / Math.max(1, rect.height - innerHeight));
      const seg = (start: number, end: number) =>
        clamp((progress - start) / (end - start));

      const zoom = seg(0.1, 0.48);
      const intro = seg(0.02, 0.14);
      set("intro", {
        opacity: String(1 - intro),
        transform: `translateY(${-40 * intro}px)`,
        visibility: intro >= 1 ? "hidden" : "visible",
      });
      set("hint", { opacity: String(1 - seg(0, 0.05)) });
      set("small-card", {
        transform: `translateY(${zoom * 8}vh) scale(${1 + 9 * zoom ** 3})`,
        filter: `brightness(${1 + 2.2 * seg(0.3, 0.48)})`,
        opacity: String(1 - seg(0.5, 0.54)),
      });
      root.style.setProperty(
        "--backdrop-scale",
        String(1 + 0.18 * smoothstep(zoom) * (1 - seg(0.5, 0.62))),
      );
      set("flash", {
        opacity: String(Math.min(seg(0.34, 0.47), 1 - seg(0.52, 0.62))),
      });
      set("scene-two", {
        opacity: String(seg(0.5, 0.56)),
        pointerEvents: progress > 0.55 ? "auto" : "none",
        visibility: progress > 0.49 ? "visible" : "hidden",
      });
      const card = smoothstep(seg(0.52, 0.86));
      set("wide-card", {
        transform: `translateY(${(1 - card) * 90}px) rotateX(${18 * card + 40 * (1 - card)}deg) rotateZ(${-28 * card + 10 * (1 - card)}deg) scale(${0.7 + 0.3 * card})`,
      });
      set("streaks", { opacity: String(seg(0.66, 0.8)) });
      const slide = (name: string, start: number, end: number, dx: number) => {
        const amount = smoothstep(seg(start, end));
        set(name, {
          opacity: String(amount),
          transform: `translateX(${(1 - amount) * dx}px)`,
        });
      };
      slide("evaluated", 0.6, 0.7, -60);
      slide("before-pay", 0.72, 0.82, 60);
      slide("scene-copy", 0.8, 0.9, -40);
    };

    // Pointer tilt of the small card, eased (0.3s in CSS).
    const tilt = (event: PointerEvent) => {
      if (reduceMotion || event.pointerType === "touch") return;
      const x = event.clientX / innerWidth - 0.5;
      const y = event.clientY / innerHeight - 0.5;
      set("tilt", {
        transform: `rotateY(${x * 28}deg) rotateX(${-y * 18}deg)`,
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    addEventListener("pointermove", tilt, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      removeEventListener("pointermove", tilt);
      root.style.removeProperty("--backdrop-scale");
    };
  }, []);

  return <span ref={markerRef} hidden />;
}
