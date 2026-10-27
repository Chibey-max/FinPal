import { useMemo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ms, s } from "@/lib/screen";
import { useTheme } from "@/lib/theme-context";
import { font, mono, radius, type Palette, type Tone } from "@/theme";

/** Text in the app's default face and colour. Always use this, not RN's Text. */
export function Text({ style, ...props }: TextProps) {
  const { colors } = useTheme();
  return (
    <NativeText
      {...props}
      style={[{ fontFamily: font.regular, color: colors.ink }, style]}
    />
  );
}

/** Styles for the shared pieces below, rebuilt when the theme changes. */
export function useStyles() {
  const { colors } = useTheme();
  return useMemo(() => makeStyles(colors), [colors]);
}

/** Scrolling page with pull-to-refresh. The top bar owns the status-bar inset. */
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
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: s(24),
        paddingHorizontal: s(16),
        paddingBottom: insets.bottom + s(48),
        gap: s(20),
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
  return <Text style={useStyles().title}>{children}</Text>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={useStyles().eyebrow}>{children}</Text>;
}

/** Glass panel: hairline border, large radius, translucent over the orb. */
export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
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

/** Card heading row with an optional quiet link on the right. */
export function CardHead({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.cardHead}>
      <Text style={styles.cardTitle}>{title}</Text>
      {action ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="link"
          hitSlop={10}
          style={{ minHeight: 48, justifyContent: "center" }}
        >
          <Text style={styles.quietLink}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Status pill. Always carries a literal label, never colour alone. */
export function Badge({ label, tone }: { label: string; tone: Tone }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const t = colors.tones[tone];
  return (
    <View
      style={[styles.badge, { backgroundColor: t.fill, borderColor: t.line }]}
    >
      <Text style={[styles.badgeText, { color: t.color }]}>{label}</Text>
    </View>
  );
}

export function Meter({ percent, tone }: { percent: number; tone: Tone }) {
  const { colors } = useTheme();
  return (
    <View style={useStyles().meter}>
      <View
        style={{
          width: `${percent}%`,
          height: "100%",
          borderRadius: 2,
          backgroundColor: colors.tones[tone].color,
        }}
      />
    </View>
  );
}

export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={useStyles().center}>
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
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Card style={{ borderColor: colors.tones.bad.line, gap: s(10) }}>
      <Badge label="COULD NOT LOAD" tone="bad" />
      <Text style={styles.body}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          style={{ minHeight: 48, justifyContent: "center" }}
        >
          <Text style={styles.link}>Try again</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1 },
    title: {
      fontFamily: font.light,
      fontSize: ms(44),
      lineHeight: ms(48),
      letterSpacing: -1.5,
    },
    eyebrow: {
      color: c.ink4,
      fontFamily: mono,
      fontSize: ms(11),
      letterSpacing: 0.7,
      textTransform: "uppercase",
    },
    card: {
      backgroundColor: c.card,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: radius.card,
      padding: s(18),
      gap: s(12),
      overflow: "hidden",
    },
    cardHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: s(12),
    },
    cardTitle: { fontFamily: font.medium, fontSize: ms(16) },
    quietLink: { color: c.ink3, fontSize: ms(13) },
    badge: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderRadius: radius.pill,
      paddingHorizontal: s(9),
      paddingVertical: s(3),
    },
    badgeText: { fontFamily: mono, fontSize: ms(10.5), letterSpacing: 0.5 },
    meter: {
      height: 4,
      borderRadius: 2,
      backgroundColor: c.meterTrack,
      overflow: "hidden",
    },
    center: { paddingVertical: s(48), alignItems: "center" },
    body: { color: c.ink2, fontSize: ms(14), lineHeight: ms(21) },
    link: { color: c.brand, fontFamily: font.medium, fontSize: ms(14) },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: s(16),
      paddingVertical: s(6),
    },
    rowLabel: { color: c.ink3, fontSize: ms(14) },
    rowValue: {
      color: c.ink,
      fontSize: ms(14),
      flexShrink: 1,
      textAlign: "right",
    },
  });
}
