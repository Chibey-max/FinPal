import type { TrustSignal } from "@finpal/contracts";

// Plain module (not "use client") so server pages can read the presets too.

export interface ProposalDraft {
  name: string;
  price: string;
  currency: string;
  source: "MANUAL" | "CALENDAR";
  time: string;
  trust: TrustSignal;
}

export const PRESETS = {
  auto: {
    label: "Auto-approve",
    draft: {
      name: "Sony WH-1000XM5",
      price: "329.00",
      currency: "USD",
      time: "14:30",
      trust: "NOT_CHECKED",
    },
  },
  review: {
    label: "Manual review",
    draft: {
      name: "Herman Miller Sayl chair",
      price: "489.00",
      currency: "USD",
      time: "14:30",
      trust: "PASS",
    },
  },
  blocked: {
    label: "Blocked",
    draft: {
      name: "Dyson V15 Detect",
      price: "899.00",
      currency: "USD",
      time: "14:30",
      trust: "NOT_CHECKED",
    },
  },
  insufficient: {
    label: "Insufficient data",
    draft: {
      name: "Leica M6 leather strap",
      price: "185.00",
      currency: "USD",
      time: "14:30",
      trust: "NOT_CHECKED",
    },
  },
  outside: {
    label: "Outside window",
    draft: {
      name: "Nintendo Switch OLED",
      price: "349.99",
      currency: "USD",
      time: "23:40",
      trust: "NOT_CHECKED",
    },
  },
  currency: {
    label: "Currency mismatch",
    draft: {
      name: "Sony WH-1000XM5",
      price: "299.00",
      currency: "EUR",
      time: "14:30",
      trust: "NOT_CHECKED",
    },
  },
} as const satisfies Record<
  string,
  { label: string; draft: Omit<ProposalDraft, "source"> }
>;

export type PresetKey = keyof typeof PRESETS;

export interface EventContext {
  id: string;
  title: string;
  /** "YYYY-MM-DD" in the constraints timezone. */
  date: string;
  time: string;
  label: string;
}
