"use client";

import { useRef, useState } from "react";

import { errorMessage } from "@/lib/api-client";

/**
 * Camera / upload control: photo → Groq vision → shopping-list text.
 * Does not shop or pay; the user still reviews the line and taps shop.
 */
export function SnapSearchButton({
  value,
  onChange,
  disabled,
  onError,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  onError?: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file || busy || disabled) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("image", file, file.name || "snap.jpg");
      const response = await fetch("/api/v1/agent/vision", {
        method: "POST",
        body,
      });
      const data = (await response.json().catch(() => null)) as {
        text?: string;
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(
          data?.error?.message ?? `Snap search failed (${response.status}).`,
        );
      }
      const text = data?.text?.trim();
      if (!text) throw new Error("No product was recognized in that photo.");
      const next = value.trim() ? `${value.trim()}\n${text}` : text;
      onChange(next.slice(0, 1000));
    } catch (error) {
      onError?.(errorMessage(error));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      <button
        type="button"
        className="agent-mic agent-snap"
        data-busy={busy || undefined}
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        aria-label={busy ? "Reading photo" : "Snap a product to search"}
        title="Take or upload a photo — FinPal turns it into a list line"
      >
        <SnapIcon />
        <span className="agent-mic__label">
          {busy ? "Reading…" : "Snap"}
        </span>
      </button>
    </>
  );
}

function SnapIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 8V6a2 2 0 0 1 2-2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" />
      <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}
