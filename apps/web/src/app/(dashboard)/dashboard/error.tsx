"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

// Shown if loading the dashboard fails, e.g. Supabase is unreachable.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard failed to load", error);
  }, [error]);

  return (
    <main className="grid max-w-lg gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Decisions</h1>
      <div
        role="alert"
        className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
      >
        <p className="font-medium">The dashboard could not be loaded.</p>
        <p>
          Your purchases and payments are safe; nothing was changed. Try again
          in a moment.
          {error.digest ? ` Reference: ${error.digest}.` : ""}
        </p>
      </div>
      <Button onClick={reset} className="justify-self-start">
        Try again
      </Button>
    </main>
  );
}
