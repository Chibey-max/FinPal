"use client";

import { useEffect } from "react";

import { LiquidButton } from "@/components/ui/liquid-glass-button";
// Shown if a section fails to load, e.g. Supabase is unreachable.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("FinPal page failed to load", error);
  }, [error]);

  return (
    <div className="app-page app-page--narrow">
      <div className="page-head__text">
        <h1>Something went wrong</h1>
        <p>
          Your purchases and payments are safe; nothing was changed. Try again
          in a moment.
          {error.digest ? ` Reference: ${error.digest}.` : ""}
        </p>
      </div>
      <LiquidButton
        type="button"
        size="lg"
        className="self-start rounded-full"
        onClick={reset}
      >
        Try again
      </LiquidButton>
    </div>
  );
}
