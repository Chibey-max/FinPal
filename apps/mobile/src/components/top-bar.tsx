import type { DecisionRow } from "@finpal/contracts";
import { useRouter, usePathname, type Href } from "expo-router";
import { useEffect, useRef } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LogoutIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Text } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { isOpenPayment } from "@/lib/present";
import { ms, s } from "@/lib/screen";
import { useTheme } from "@/lib/theme-context";
import { useApi } from "@/lib/use-api";
import { font, mono } from "@/theme";

// The web app's navigation, in the same order.
const NAV: {
  label: string;
  href: Href;
  prefix: string;
  badge?: "review" | "payments";
}[] = [
  { label: "Overview", href: "/overview", prefix: "/overview" },
  { label: "Calendar", href: "/calendar", prefix: "/calendar" },
  { label: "New proposal", href: "/proposals/new", prefix: "/proposals" },
  { label: "Decisions", href: "/decisions", prefix: "/decisions" },
  {
    label: "Review queue",
    href: "/review",
    prefix: "/review",
    badge: "review",
  },
  {
    label: "Payments",
    href: "/payments",
    prefix: "/payments",
    badge: "payments",
  },
  { label: "Activity", href: "/activity", prefix: "/activity" },
  { label: "Constraints", href: "/constraints", prefix: "/constraints" },
];

/** The web's glass top bar: logo, theme toggle, then a scrolling pill nav. */
export function TopBar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();
  const { mock, signOut } = useAuth();
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});

  // Counts for the nav badges; refreshed whenever the screen changes.
  const decisions = useApi<{ rows: DecisionRow[] }>("/api/v1/decisions");
  useEffect(() => {
    decisions.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  const rows = decisions.data?.rows ?? [];
  const badges = {
    review: rows.filter(
      (row) => row.outcome === "MANUAL_REVIEW" && row.reviewStatus === null,
    ).length,
    payments: rows.filter((row) => isOpenPayment(row.paymentStatus)).length,
  };

  // Keep the active pill in view as the nav scrolls horizontally.
  useEffect(() => {
    const active = NAV.find((item) => pathname.startsWith(item.prefix));
    const x = active ? offsets.current[active.label] : undefined;
    if (x !== undefined)
      scroll.current?.scrollTo({ x: Math.max(0, x - 24), animated: true });
  }, [pathname]);

  // The intro screen draws its own bar.
  if (pathname === "/") return null;

  return (
    <View
      style={{
        marginTop: insets.top + s(10),
        marginHorizontal: s(12),
        paddingTop: s(7),
        paddingBottom: s(7),
        paddingHorizontal: s(7),
        gap: s(8),
        borderRadius: 30,
        borderWidth: 1,
        borderColor: colors.chromeLine,
        backgroundColor: colors.navSolid,
        zIndex: 10,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: s(13),
        }}
      >
        <Logo size={ms(26)} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
          <ThemeToggle />
          {mock ? null : (
            <Pressable
              onPress={() => {
                void signOut();
                router.replace("/");
              }}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              style={({ pressed }) => ({
                width: 48,
                height: 48,
                borderRadius: 24,
                borderWidth: 1,
                borderColor: colors.chromeLine,
                backgroundColor: pressed ? colors.chromeActive : colors.chrome,
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <LogoutIcon color={colors.ink2} />
            </Pressable>
          )}
        </View>
      </View>
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          padding: 3,
          gap: 2,
          borderRadius: 999,
          backgroundColor: colors.chrome,
        }}
        style={{ borderRadius: 999 }}
      >
        {NAV.map((item) => {
          const active = pathname.startsWith(item.prefix);
          const count = item.badge ? badges[item.badge] : 0;
          return (
            <Pressable
              key={item.label}
              onPress={() => router.navigate(item.href)}
              onLayout={(e) => {
                offsets.current[item.label] = e.nativeEvent.layout.x;
              }}
              accessibilityRole="link"
              accessibilityState={{ selected: active }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: s(14),
                paddingVertical: s(8),
                minHeight: 48,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? colors.divider : "transparent",
                backgroundColor: active ? colors.chromeActive : "transparent",
              }}
            >
              <Text
                style={{
                  fontFamily: active ? font.medium : font.regular,
                  fontSize: ms(13),
                  color: active ? colors.ink : colors.ink3,
                }}
              >
                {item.label}
              </Text>
              {count ? (
                <Text
                  accessibilityLabel={`${count} pending`}
                  style={{
                    fontFamily: mono,
                    fontSize: ms(10.5),
                    color: colors.tones.warn.color,
                  }}
                >
                  {count}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
