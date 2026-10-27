import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { palettes, type Palette, type Scheme } from "@/theme";

// Same key and default as the web: dark unless the user chose light.
const STORAGE_KEY = "finpal-theme";

type ThemeValue = {
  scheme: Scheme;
  colors: Palette;
  toggle: () => void;
  /** False until the saved choice has been read, to avoid a flash. */
  ready: boolean;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setScheme] = useState<Scheme>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === "light") setScheme("light");
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const toggle = useCallback(() => {
    setScheme((current) => {
      const next: Scheme = current === "dark" ? "light" : "dark";
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ scheme, colors: palettes[scheme], toggle, ready }),
    [scheme, toggle, ready],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside AppThemeProvider.");
  return value;
}
