import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Animated, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui";
import { ms, s } from "@/lib/screen";
import { useTheme } from "@/lib/theme-context";

type ToastTone = "ok" | "bad";
type Show = (message: string, tone?: ToastTone) => void;

const ToastContext = createContext<Show>(() => {});

/** Brief message at the bottom of the screen, as the web's toasts. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    tone: ToastTone;
  } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback<Show>(
    (message, tone = "ok") => {
      clearTimeout(timer.current);
      setToast({ id: Date.now(), message, tone });
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start();
      timer.current = setTimeout(
        () =>
          Animated.timing(opacity, {
            toValue: 0,
            duration: 240,
            useNativeDriver: true,
          }).start(() => setToast(null)),
        Math.min(6000, 2600 + message.length * 28),
      );
    },
    [opacity],
  );

  useEffect(() => () => clearTimeout(timer.current), []);
  const value = useMemo(() => show, [show]);
  const tone = toast ? colors.tones[toast.tone === "bad" ? "bad" : "ok"] : null;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && tone ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: s(16),
            right: s(16),
            bottom: insets.bottom + s(20),
            opacity,
            zIndex: 50,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s(10),
              paddingVertical: s(12),
              paddingHorizontal: s(16),
              borderRadius: 16,
              borderWidth: 1,
              borderColor: tone.line,
              backgroundColor: colors.navSolid,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: tone.color,
              }}
            />
            <Text style={{ flex: 1, fontSize: ms(13.5), lineHeight: ms(19) }}>
              {toast.message}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
