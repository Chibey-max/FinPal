import { Pressable } from "react-native";

import { MoonIcon, SunIcon } from "@/components/icons";
import { useTheme } from "@/lib/theme-context";

/** Round icon button: the moon in dark mode, the sun in light, as on the web. */
export function ThemeToggle() {
  const { scheme, colors, toggle } = useTheme();
  const Icon = scheme === "dark" ? MoonIcon : SunIcon;
  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={
        scheme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      }
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
      <Icon color={colors.ink2} />
    </Pressable>
  );
}
