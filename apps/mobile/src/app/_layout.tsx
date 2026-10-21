import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colors } from "@/theme";

// In a desktop browser, hold the app to a phone-sized column so the preview
// matches the device layout. Native builds fill the screen as usual.
const PHONE_WIDTH = 430;

export default function RootLayout() {
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
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="decisions/[id]" />
        </Stack>
      </View>
    </SafeAreaProvider>
  );
}
