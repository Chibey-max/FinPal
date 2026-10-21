import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";

import { ms } from "@/lib/screen";
import { colors, mono } from "@/theme";

const glyph = (char: string) =>
  function TabGlyph({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: ms(18) }}>{char}</Text>;
  };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.ink4,
        tabBarLabelStyle: { fontFamily: mono, fontSize: ms(10.5) },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Overview", tabBarIcon: glyph("◎") }}
      />
      <Tabs.Screen
        name="decisions"
        options={{ title: "Decisions", tabBarIcon: glyph("☰") }}
      />
    </Tabs>
  );
}
