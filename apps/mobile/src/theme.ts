// Tokens from packages/ui/src/tokens.css, dark and light. Colours are read
// through useTheme() (src/lib/theme-context.tsx), never imported directly, so
// every screen follows the active scheme.
export type Scheme = "dark" | "light";
export type Tone = "ok" | "warn" | "bad" | "info" | "muted" | "plain";

export type ToneStyle = { color: string; fill: string; line: string };

export type Palette = {
  scheme: Scheme;
  background: string;
  /** Glass panel over the orb; the web's --panel plus the blur it lacks here. */
  card: string;
  cardRaised: string;
  inset: string;
  navSolid: string;
  /** The web's w05..w1 steps: hairlines and borders. */
  hairline: string;
  divider: string;
  border: string;
  chromeLine: string;
  chrome: string;
  chromeActive: string;
  meterTrack: string;
  ink: string;
  ink2: string;
  ink3: string;
  ink4: string;
  ink5: string;
  brand: string;
  onBrand: string;
  logoPal: string;
  /** Wash over the orb that keeps text readable, and its deeper bottom fade. */
  veilWash: string;
  veilDeep: string;
  /** Hero card (landing tokens). */
  cardLine: string;
  cardText: string;
  cardGlow: string;
  cardFill: [string, string, string];
  tones: Record<Tone, ToneStyle>;
};

function parse(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}

function tone(
  color: string,
  rgb?: readonly [number, number, number],
): ToneStyle {
  const [r, g, b] = rgb ?? parse(color);
  return {
    color,
    fill: `rgba(${r},${g},${b},0.12)`,
    line: `rgba(${r},${g},${b},0.35)`,
  };
}

const dark: Palette = {
  scheme: "dark",
  background: "#040509",
  card: "rgba(14,17,26,0.64)",
  cardRaised: "rgba(24,29,44,0.8)",
  inset: "rgba(5,7,12,0.6)",
  navSolid: "rgba(11,14,21,0.97)",
  hairline: "rgba(255,255,255,0.05)",
  divider: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.08)",
  chromeLine: "rgba(255,255,255,0.1)",
  chrome: "rgba(255,255,255,0.03)",
  chromeActive: "rgba(255,255,255,0.08)",
  meterTrack: "rgba(255,255,255,0.07)",
  ink: "#edeef0",
  ink2: "#b4bac3",
  ink3: "#9097a1",
  ink4: "#7c838d",
  ink5: "#5e6570",
  brand: "#b7cbf6",
  onBrand: "#0a1430",
  logoPal: "#afc8ff",
  veilWash: "rgba(4,5,9,0.18)",
  veilDeep: "rgba(4,5,9,0.7)",
  cardLine: "rgba(215,228,255,0.6)",
  cardText: "rgba(235,242,255,0.9)",
  cardGlow: "rgba(150,185,255,0.6)",
  cardFill: [
    "rgba(190,210,255,0.22)",
    "rgba(60,80,130,0.12)",
    "rgba(140,170,230,0.16)",
  ],
  tones: {
    ok: tone("#c8daff"),
    warn: tone("#f2c879"),
    bad: tone("#ff7a6b"),
    info: tone("#8fb8ff"),
    muted: tone("#9097a1"),
    plain: tone("#b4bac3"),
  },
};

const light: Palette = {
  scheme: "light",
  background: "#edf0f5",
  card: "rgba(255,255,255,0.7)",
  cardRaised: "rgba(255,255,255,0.9)",
  inset: "rgba(255,255,255,0.75)",
  navSolid: "rgba(251,252,253,0.97)",
  hairline: "rgba(14,20,36,0.063)",
  divider: "rgba(14,20,36,0.075)",
  border: "rgba(14,20,36,0.1)",
  chromeLine: "rgba(14,20,36,0.125)",
  chrome: "rgba(14,20,36,0.037)",
  chromeActive: "rgba(14,20,36,0.1)",
  meterTrack: "rgba(14,20,36,0.088)",
  ink: "#0c111c",
  ink2: "#384050",
  ink3: "#566072",
  ink4: "#667084",
  ink5: "#8790a2",
  brand: "#2f5fd0",
  onBrand: "#ffffff",
  logoPal: "#3e6cc8",
  veilWash: "rgba(237,240,245,0.22)",
  veilDeep: "rgba(237,240,245,0.72)",
  cardLine: "rgba(40,72,150,0.32)",
  cardText: "rgba(12,17,28,0.82)",
  cardGlow: "rgba(80,120,210,0.28)",
  cardFill: [
    "rgba(255,255,255,0.82)",
    "rgba(214,224,245,0.55)",
    "rgba(236,241,252,0.72)",
  ],
  tones: {
    ok: tone("#284896", [40, 72, 150]),
    warn: tone("#a5650a", [196, 128, 18]),
    bad: tone("#c23a28", [206, 58, 38]),
    info: tone("#2c5ec4", [47, 98, 200]),
    muted: tone("#566072"),
    plain: tone("#384050"),
  },
};

export const palettes: Record<Scheme, Palette> = { dark, light };

// Rubik for interface text, Geist Mono for ids, statuses and money, Instrument
// Serif italic for single accent words, as on the web. React Native picks the
// file per weight, so there is one family each.
export const font = {
  light: "Rubik_300Light",
  regular: "Rubik_400Regular",
  medium: "Rubik_500Medium",
  semibold: "Rubik_600SemiBold",
  bold: "Rubik_700Bold",
  accent: "InstrumentSerif_400Regular_Italic",
} as const;

export const mono = "GeistMono_400Regular";

export const radius = { card: 20, pill: 999, small: 10 } as const;
