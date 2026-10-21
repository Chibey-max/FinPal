import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ms, s } from "@/lib/screen";

import {
  colors,
  mono,
  radius,
  toneColor,
  toneFill,
  toneLine,
  type Tone,
} from "@/theme";

/** Scrolling page with pull-to-refresh, padded for the notch and tab bar. */
export function Screen({
  children,
  refreshing = false,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: s(16),
        paddingBottom: s(32),
        gap: s(14),
      }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.ink3}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          pressed && { backgroundColor: colors.cardRaised },
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Status pill. Always carries a literal label, never colour alone. */
export function Badge({ label, tone }: { label: string; tone: Tone }) {
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: toneFill(tone), borderColor: toneLine(tone) },
      ]}
    >
      <Text style={[styles.badgeText, { color: toneColor[tone] }]}>
        {label}
      </Text>
    </View>
  );
}

export function Meter({ percent, tone }: { percent: number; tone: Tone }) {
  return (
    <View style={styles.meter}>
      <View
        style={{
          width: `${percent}%`,
          height: "100%",
          backgroundColor: toneColor[tone],
        }}
      />
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.ink3} />
    </View>
  );
}

export function ErrorNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card style={{ borderColor: toneLine("bad"), gap: s(10) }}>
      <Badge label="COULD NOT LOAD" tone="bad" />
      <Text style={styles.body}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button">
          <Text style={styles.link}>Try again</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  title: {
    color: colors.ink,
    fontSize: ms(34),
    fontWeight: "300",
    letterSpacing: -0.5,
  },
  eyebrow: {
    color: colors.ink3,
    fontFamily: mono,
    fontSize: ms(11),
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: s(16),
    gap: s(8),
  },
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: s(9),
    paddingVertical: s(3),
  },
  badgeText: { fontFamily: mono, fontSize: ms(10.5), letterSpacing: 0.6 },
  meter: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  center: { paddingVertical: s(48), alignItems: "center" },
  body: { color: colors.ink2, fontSize: ms(14), lineHeight: ms(20) },
  link: { color: colors.brand, fontSize: ms(14), fontWeight: "600" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: s(16),
    paddingVertical: s(6),
  },
  rowLabel: { color: colors.ink3, fontSize: ms(14) },
  rowValue: {
    color: colors.ink,
    fontSize: ms(14),
    flexShrink: 1,
    textAlign: "right",
  },
});
