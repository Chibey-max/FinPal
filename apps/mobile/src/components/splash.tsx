import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { Animated, Image, StyleSheet, useWindowDimensions } from "react-native";

// Hold the native splash until ours is on screen, so the handover never shows
// a blank or white frame. The splash is always the dark theme's colour.
SplashScreen.preventAutoHideAsync().catch(() => {});

const BACKGROUND = "#040509";
/** Long enough to register as a brand moment, short enough not to be a wait. */
const MIN_VISIBLE_MS = 700;
const FADE_MS = 320;

// Logo mark on the left, "FinPal" beside it: 240 x 66 at 4x.
const LOCKUP = require("../../assets/splash-lockup.png");
const LOCKUP_RATIO = 66 / 240;

/**
 * The app's own splash: the lockup on the dark background. Covers the screen
 * until `ready` (fonts and saved theme loaded), then fades away.
 */
export function SplashOverlay({ ready }: { ready: boolean }) {
  const { width } = useWindowDimensions();
  const [mounted, setMounted] = useState(true);
  const [shownLongEnough, setShownLongEnough] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setTimeout(() => setShownLongEnough(true), MIN_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready || !shownLongEnough) return;
    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start(() => setMounted(false));
  }, [ready, shownLongEnough, opacity]);

  if (!mounted) return null;

  const lockupWidth = Math.min(width * 0.6, 260);
  return (
    <Animated.View
      style={[styles.cover, { opacity }]}
      accessibilityLabel="FinPal"
      accessible
    >
      <Image
        source={LOCKUP}
        style={{ width: lockupWidth, height: lockupWidth * LOCKUP_RATIO }}
        resizeMode="contain"
        fadeDuration={0}
        // Our splash is drawn: let the native one go.
        onLoad={() => SplashScreen.hideAsync().catch(() => {})}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cover: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BACKGROUND,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
});
