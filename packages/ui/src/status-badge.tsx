import type { ReactNode } from "react";

export interface StatusBadgeProps {
  children: ReactNode;
}

export function StatusBadge({ children }: StatusBadgeProps) {
  return <span>{children}</span>;
}
