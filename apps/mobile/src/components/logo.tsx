import { View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Polyline,
  Stop,
} from "react-native-svg";

import { Text } from "@/components/ui";
import { useTheme } from "@/lib/theme-context";
import { font } from "@/theme";

// Port of apps/web/src/components/logo.tsx: a navy fold behind a periwinkle
// panel carrying a rising check-line, with the panel and line cut out of
// whatever sits behind the mark (`knockout`).
const PANEL =
  "M21 26L48 12.5C53 10 58 13 58 19V33C58 38 55.5 41 51 43.2L29 54L21 59.5Z";

export function LogoMark({
  size = 24,
  knockout,
}: {
  size?: number;
  /** Colour of the surface behind the mark; defaults to the top bar's. */
  knockout?: string;
}) {
  const { colors } = useTheme();
  const cut = knockout ?? colors.navSolid;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Defs>
        <LinearGradient id="fp-fold" x1="0" y1="0" x2="0.4" y2="1">
          <Stop offset="0" stopColor="#3E5A92" />
          <Stop offset="1" stopColor="#1E2B4A" />
        </LinearGradient>
        <LinearGradient id="fp-panel" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor="#7FA6F0" />
          <Stop offset="1" stopColor="#CFE0FF" />
        </LinearGradient>
      </Defs>
      <Path
        d="M6 22C6 18 8 16 11 14.5L30 5C32 4 34 4 36 5L42 8L18 20V58L10 53.5C7.5 52 6 50 6 47Z"
        fill="url(#fp-fold)"
      />
      {/* paint-order: stroke, so the knockout ring sits under the fill. */}
      <Path d={PANEL} stroke={cut} strokeWidth={4} strokeLinejoin="round" />
      <Path d={PANEL} fill="url(#fp-panel)" />
      <Polyline
        points="27,38.5 33,34.5 37,38 47.5,27.5"
        stroke={cut}
        strokeWidth={3.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Mark plus the two-tone "FinPal" wordmark. */
export function Logo({ size = 26 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
      <LogoMark size={size} />
      <Text
        style={{ fontFamily: font.bold, fontSize: 19, letterSpacing: -0.66 }}
      >
        Fin
        <Text style={{ color: colors.logoPal, fontFamily: font.bold }}>
          Pal
        </Text>
      </Text>
    </View>
  );
}
