"use client";

import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Inline pending shimmer for the clicked <Link> while its route loads. */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className="link-pending"
      data-pending={pending || undefined}
    />
  );
}

/**
 * Plays the page entrance when moving between sections (/app/purchases ->
 * /app/rules), but not when only an id changes inside one section, so
 * selecting a row never re-animates the table around it.
 */
export function SectionTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const section = pathname.split("/").slice(0, 3).join("/");
  return (
    <div key={section} className="section-enter">
      {children}
    </div>
  );
}
