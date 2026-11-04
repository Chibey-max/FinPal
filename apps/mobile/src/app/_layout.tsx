import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono";
import { InstrumentSerif_400Regular_Italic } from "@expo-google-fonts/instrument-serif";
import {
  Rubik_300Light,
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_600SemiBold,
  Rubik_700Bold,
} from "@expo-google-fonts/rubik";
import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import { Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthGate } from "@/components/auth-gate";
import { Backdrop } from "@/components/backdrop";
import { SplashOverlay } from "@/components/splash";
import { ToastProvider } from "@/components/toast";
import { TopBar } from "@/components/top-bar";
import { AuthProvider } from "@/lib/auth";
import { AppThemeProvider, useTheme } from "@/lib/theme-context";

// In a desktop browser, hold the app to a phone-sized column so the preview
// matches the device layout. Native builds fill the screen as usual.
const PHONE_WIDTH = 430;

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </AppThemeProvider>
  );
}

function Shell() {
  const { scheme, colors, ready } = useTheme();
  const [fontsLoaded] = useFonts({
    Rubik_300Light,
    Rubik_400Regular,
    Rubik_500Medium,
    Rubik_600SemiBold,
    Rubik_700Bold,
    GeistMono_400Regular,
    InstrumentSerif_400Regular_Italic,
  });

  // The navigator paints an opaque background of its own; make it transparent
  // so the orb behind it shows through.
  const navTheme = useMemo(() => {
    const base = scheme === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: "transparent",
        card: "transparent",
      },
    };
  }, [scheme]);

  return (
    <SafeAreaProvider>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          width: "100%",
          maxWidth: Platform.OS === "web" ? PHONE_WIDTH : undefined,
          alignSelf: "center",
        }}
      >
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        {/* Hold the app back until the fonts and saved theme are in, so text
            never flashes in the phone's own face or the wrong theme. The
            splash covers that wait. */}
        {fontsLoaded && ready ? (
          <ThemeProvider value={navTheme}>
            <ToastProvider>
              <Backdrop />
              <AuthGate>
                <TopBar />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: "transparent" },
                  }}
                />
              </AuthGate>
            </ToastProvider>
          </ThemeProvider>
        ) : null}
        <SplashOverlay ready={fontsLoaded && ready} />
      </View>
    </SafeAreaProvider>
  );
}
