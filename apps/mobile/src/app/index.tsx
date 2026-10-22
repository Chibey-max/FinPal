import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PlayIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, Text } from "@/components/ui";
import { ms, s } from "@/lib/screen";
import { useTheme } from "@/lib/theme-context";
import { font, mono, type Palette } from "@/theme";

// Copy from apps/web/src/app/page.tsx.
const STEPS = [
  [
    "01",
    "Constrain",
    "Allowed time windows, a timezone, daily and monthly caps. No constraints means no automatic approval.",
  ],
  [
    "02",
    "Propose",
    "A product, price and currency, entered by hand or prefilled from a calendar event.",
  ],
  ["03", "Evaluate", "FinPal checks time windows, caps, price and trust."],
  ["04", "Decide", "Rules return auto-approve, review or block."],
  [
    "05",
    "Pay and audit",
    "PayPal Sandbox order, authorize, then capture or void. Every step is logged.",
  ],
] as const;

/** The intro: the web landing hero, then the five steps. */
export default function Intro() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { colors } = useTheme();
  const scroll = useRef<ScrollView>(null);
  const [stepsY, setStepsY] = useState(0);
  const heroHeight = Math.max(620, height);
  const open = () => router.navigate("/overview");

  return (
    <ScrollView
      ref={scroll}
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ height: heroHeight }}>
        <Header top={insets.top + s(10)} onOpen={open} />

        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            // On the orb, a touch above its centre, as on the web.
            top: heroHeight * 0.47 - s(150) / 0.63 / 2,
            alignItems: "center",
          }}
          pointerEvents="none"
        >
          <FinPalCard />
        </View>

        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: s(22),
            paddingBottom: s(52),
          }}
        >
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}
          >
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: colors.tones.info.fill,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.tones.info.color,
                }}
              />
            </View>
            <Text
              style={{
                flexShrink: 1,
                fontFamily: mono,
                fontSize: ms(10.5),
                letterSpacing: 0.65,
                textTransform: "uppercase",
                color: colors.ink2,
              }}
            >
              Agent-assisted purchasing · PayPal Sandbox
            </Text>
          </View>

          <Text
            style={{
              marginTop: s(20),
              fontFamily: font.light,
              fontSize: ms(42),
              lineHeight: ms(42) * 0.98,
              letterSpacing: -1.5,
            }}
          >
            One agent.{"\n"}Zero{" "}
            <Text
              style={{
                fontFamily: font.accent,
                fontSize: ms(47),
                letterSpacing: -0.5,
              }}
            >
              blind
            </Text>{" "}
            spends.
          </Text>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: s(10),
              marginTop: s(26),
            }}
          >
            <PrimaryPill label="Run a proposal" onPress={open} />
            <GlassPill
              label="How it works"
              icon={<PlayIcon size={18} color={colors.ink} />}
              onPress={() =>
                scroll.current?.scrollTo({ y: stepsY, animated: true })
              }
            />
          </View>
        </View>

        <Text
          style={{
            position: "absolute",
            bottom: s(16),
            alignSelf: "center",
            fontFamily: mono,
            fontSize: ms(10),
            letterSpacing: 1.4,
            color: colors.ink4,
          }}
        >
          SCROLL
        </Text>
      </View>

      <View
        onLayout={(e) => setStepsY(e.nativeEvent.layout.y)}
        style={{
          paddingHorizontal: s(16),
          paddingTop: s(40),
          paddingBottom: insets.bottom + s(56),
          gap: s(14),
          backgroundColor: colors.veilWash,
        }}
      >
        <Text
          style={{ color: colors.ink2, fontSize: ms(14.5), lineHeight: ms(23) }}
        >
          FinPal places a policy and evidence layer between a purchase proposal
          and a payment. It evaluates first, decides second, and pays only when
          the decision permits it.
        </Text>
        <Text
          style={{
            marginTop: s(14),
            fontFamily: font.light,
            fontSize: ms(32),
            lineHeight: ms(34),
            letterSpacing: -1,
          }}
        >
          Five steps between an idea and a payment.
        </Text>
        <Text
          style={{
            fontFamily: mono,
            fontSize: ms(11.5),
            lineHeight: ms(18),
            color: colors.ink3,
          }}
        >
          a proposal is not a payment.{"\n"}same evidence → same outcome.
        </Text>

        {STEPS.map(([n, title, body]) => (
          <Card key={n} style={{ gap: s(8) }}>
            <Text
              style={{
                fontFamily: mono,
                fontSize: ms(11),
                color: colors.ink4,
                letterSpacing: 0.7,
              }}
            >
              {n}
            </Text>
            <Text style={{ fontFamily: font.medium, fontSize: ms(18) }}>
              {title}
            </Text>
            <Text
              style={{
                color: colors.ink2,
                fontSize: ms(14),
                lineHeight: ms(21),
              }}
            >
              {body}
            </Text>
          </Card>
        ))}

        <View style={{ alignItems: "flex-start", marginTop: s(10) }}>
          <PrimaryPill label="Open app" onPress={open} />
        </View>
      </View>
    </ScrollView>
  );
}

/** Glass pill header: logo, theme toggle, Open app. */
function Header({ top, onOpen }: { top: number; onOpen: () => void }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        marginTop: top,
        marginHorizontal: s(12),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: s(7),
        paddingLeft: s(20),
        paddingRight: s(7),
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.chromeLine,
        backgroundColor: colors.navSolid,
        zIndex: 10,
      }}
    >
      <Logo size={ms(26)} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
        <ThemeToggle />
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          style={({ pressed }) => ({
            height: 36,
            paddingHorizontal: s(16),
            borderRadius: 18,
            borderWidth: 1,
            borderColor: colors.chromeLine,
            backgroundColor: pressed ? colors.chromeActive : colors.chrome,
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <Text style={{ fontFamily: font.medium, fontSize: ms(13) }}>
            Open app
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function PrimaryPill({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: 46,
        paddingHorizontal: s(24),
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.chromeLine,
        backgroundColor: colors.navSolid,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <Text style={{ fontFamily: font.medium, fontSize: ms(14) }}>{label}</Text>
      {/* The soft blue underline the web's liquid button carries. */}
      <LinearGradient
        colors={["transparent", colors.brand, "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          position: "absolute",
          left: "12%",
          right: "12%",
          bottom: 0,
          height: 2,
        }}
      />
    </Pressable>
  );
}

function GlassPill({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: 46,
        flexDirection: "row",
        gap: 9,
        paddingHorizontal: s(22),
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.chromeLine,
        backgroundColor: colors.card,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      {icon}
      <Text style={{ fontFamily: font.medium, fontSize: ms(14) }}>{label}</Text>
    </Pressable>
  );
}

/** The translucent FINPAL card that floats on the orb. */
function FinPalCard() {
  const { colors } = useTheme();
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(float, {
            toValue: 1,
            duration: 3500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(float, {
            toValue: 0,
            duration: 3500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [float]);

  const width = s(150);
  const height = width / 0.63;
  const glowW = width * 1.9;
  const glowH = height * 1.55;

  return (
    <Animated.View
      style={{
        width,
        height,
        transform: [
          {
            translateY: float.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -10],
            }),
          },
          {
            rotate: float.interpolate({
              inputRange: [0, 1],
              outputRange: ["-2deg", "1deg"],
            }),
          },
        ],
      }}
    >
      {/* Soft outer glow around the card. */}
      <Svg
        width={glowW}
        height={glowH}
        style={{
          position: "absolute",
          left: (width - glowW) / 2,
          top: (height - glowH) / 2,
        }}
        pointerEvents="none"
      >
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0.45" stopColor={colors.cardGlow} stopOpacity={0.6} />
            <Stop offset="0.7" stopColor={colors.cardGlow} stopOpacity={0.22} />
            <Stop offset="1" stopColor={colors.cardGlow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#glow)" />
      </Svg>

      <View
        style={{
          flex: 1,
          overflow: "hidden",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.cardLine,
        }}
      >
        <LinearGradient
          colors={colors.cardFill}
          locations={[0, 0.45, 1]}
          start={{ x: 0.3, y: 0 }}
          end={{ x: 0.7, y: 1 }}
          style={{ position: "absolute", inset: 0 }}
        />
        <LinearGradient
          colors={[
            "rgba(255,255,255,0)",
            "rgba(255,255,255,0.22)",
            "rgba(255,255,255,0)",
          ]}
          locations={[0.3, 0.46, 0.56]}
          start={{ x: 0, y: 0.15 }}
          end={{ x: 1, y: 0.85 }}
          style={{ position: "absolute", inset: 0 }}
        />
        <VerticalText
          text="FINPAL"
          style={{ left: 12, top: 16, fontSize: 16, letterSpacing: 3.2 }}
          colors={colors}
          face={font.light}
          length={86}
        />
        <LinearGradient
          colors={["#e6eaf2", "#9aa3b5", "#d5dbe6"]}
          locations={[0, 0.6, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: "absolute",
            left: "46%",
            top: "11%",
            width: "22%",
            aspectRatio: 0.82,
            borderRadius: 5,
          }}
        />
        <VerticalText
          text="SANDBOX"
          style={{
            left: 12,
            bottom: "24%",
            fontSize: 8,
            letterSpacing: 1.1,
            opacity: 0.7,
          }}
          colors={colors}
          face={mono}
          length={52}
        />
      </View>
    </Animated.View>
  );
}

/** Text running top to bottom, like the web's writing-mode: vertical-rl. */
function VerticalText({
  text,
  style,
  colors,
  face,
  length,
}: {
  text: string;
  style: {
    left: number;
    top?: number;
    bottom?: string;
    fontSize: number;
    letterSpacing: number;
    opacity?: number;
  };
  colors: Palette;
  face: string;
  length: number;
}) {
  const { left, top, bottom, fontSize, letterSpacing, opacity } = style;
  const thickness = fontSize + 4;
  return (
    <View
      style={{
        position: "absolute",
        left,
        ...(top !== undefined ? { top } : { bottom: bottom as `${number}%` }),
        width: thickness,
        height: length,
        opacity,
      }}
    >
      <Text
        style={{
          position: "absolute",
          width: length,
          height: thickness,
          left: (thickness - length) / 2,
          top: (length - thickness) / 2,
          color: colors.cardText,
          fontFamily: face,
          fontSize,
          letterSpacing,
          transform: [{ rotate: "90deg" }],
        }}
      >
        {text}
      </Text>
    </View>
  );
}
