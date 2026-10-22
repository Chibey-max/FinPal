import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";

import {
  ApiRequestError,
  apiBaseUrl,
  apiRequest,
  setAuthTokenProvider,
} from "@/lib/api";

// Supabase is only needed when the server runs against a real project. In
// mock mode the server has one built-in demo user and needs no sign-in.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

setAuthTokenProvider(async () => {
  const { data } = (await supabase?.auth.getSession()) ?? { data: null };
  return data?.session?.access_token ?? null;
});

type Status =
  /** Asking the server who we are. */
  | "checking"
  | "signed-in"
  | "signed-out"
  /** The server could not be reached. */
  | "offline";

type AuthValue = {
  status: Status;
  /** True when the server runs on simulated PayPal, Channel3 and KERNEL. */
  mock: boolean;
  /** Why the last check failed, when offline. */
  problem: string | null;
  /** Whether this build can sign in (EXPO_PUBLIC_SUPABASE_* are set). */
  canSignIn: boolean;
  recheck: () => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  resetPassword: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

/** Plain-language message for a Supabase auth failure. */
function authMessage(error: { message: string }) {
  if (/invalid login credentials/i.test(error.message)) {
    return "That email and password don't match.";
  }
  if (/email not confirmed/i.test(error.message)) {
    return "Confirm your email first. Check your inbox for the link.";
  }
  return error.message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [mock, setMock] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const check = useCallback(async () => {
    setStatus("checking");
    try {
      // Any authenticated call works; the summary is the cheapest.
      const summary = await apiRequest<{ mock: boolean }>("/api/v1/summary");
      setMock(summary.mock);
      setProblem(null);
      setStatus("signed-in");
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        setStatus("signed-out");
      } else {
        setProblem(error instanceof Error ? error.message : "Unknown error.");
        setStatus("offline");
      }
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  // Supabase only refreshes tokens while the app is in the foreground.
  useEffect(() => {
    if (!supabase) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    supabase.auth.startAutoRefresh();
    return () => {
      sub.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      mock,
      problem,
      canSignIn: supabase !== null,
      recheck: () => void check(),
      async signIn(email, password) {
        if (!supabase) return "Sign-in is not configured in this build.";
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) return authMessage(error);
        await check();
        return null;
      },
      async signUp(email, password) {
        if (!supabase) return "Sign-up is not configured in this build.";
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) return authMessage(error);
        // With email confirmation on there is no session until the link is used.
        if (!data.session) {
          return "Account created. Check your email to confirm it, then sign in.";
        }
        await check();
        return null;
      },
      async resetPassword(email) {
        if (!supabase) return "Password reset is not configured in this build.";
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${apiBaseUrl()}/reset-password` },
        );
        return error ? authMessage(error) : null;
      },
      async signOut() {
        await supabase?.auth.signOut();
        setStatus("signed-out");
      },
    }),
    [status, mock, problem, check],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
