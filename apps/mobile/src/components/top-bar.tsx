import { useRouter, usePathname, type Href } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Text } from "@/components/ui";
import { ms, s } from "@/lib/screen";
import { useTheme } from "@/lib/theme-context";
import { font } from "@/theme";

// Only the screens that exist. Calendar, New proposal and the Review queue
// join this list as they are built.
const NAV: { label: string; href: Href; match: (path: string) => boolean }[] = [
  {
    label: "Overview",
    href: "/overview",
    match: (path) => path === "/overview",
  },
  {
    label: "Decisions",
    href: "/decisions",
    match: (path) => path.startsWith("/decisions"),
  },
];

/** The web's glass top bar: logo and theme toggle, then a scrolling pill nav. */
export function TopBar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();

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
        <ThemeToggle />
      </View>
      <ScrollView
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
          const active = item.match(pathname);
          return (
            <Pressable
              key={item.label}
              onPress={() => router.navigate(item.href)}
              accessibilityRole="link"
              accessibilityState={{ selected: active }}
              style={{
                paddingHorizontal: s(14),
                paddingVertical: s(8),
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
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
