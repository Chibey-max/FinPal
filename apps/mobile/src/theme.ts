import { Platform } from "react-native";

// Tokens from packages/ui/src/tokens.css (dark), as opaque values.
export const colors = {
  background: "#040509",
  card: "#0e111a",
  cardRaised: "#141826",
  border: "rgba(255,255,255,0.09)",
  ink: "#edeef0",
  ink2: "#b4bac3",
  ink3: "#9097a1",
  ink4: "#7c838d",
  brand: "#b7cbf6",
  onBrand: "#0a1430",
  ok: "#c8daff",
  warn: "#f2c879",
  bad: "#ff7a6b",
  info: "#8fb8ff",
} as const;

export type Tone = "ok" | "warn" | "bad" | "info" | "muted" | "plain";

export const toneColor: Record<Tone, string> = {
  ok: colors.ok,
  warn: colors.warn,
  bad: colors.bad,
  info: colors.info,
  muted: colors.ink3,
  plain: colors.ink2,
};

/** Tone colour at 12% fill / 35% border, as the web badges do. */
export function toneFill(tone: Tone) {
  return withAlpha(toneColor[tone], 0.12);
}
export function toneLine(tone: Tone) {
  return withAlpha(toneColor[tone], 0.35);
}

function withAlpha(hex: string, alpha: number) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export const mono = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "ui-monospace, SFMono-Regular, Menlo, monospace",
});

export const radius = { card: 18, pill: 999, small: 10 } as const;
