import { usePathname } from "expo-router";
import { useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Notice, TextField } from "@/components/form";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, Loading, Text, Title } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { ms, s } from "@/lib/screen";
import { useTheme } from "@/lib/theme-context";
import { font } from "@/theme";

/**
 * Shows the app once the server knows who we are, and the sign-in screen when
 * it does not. The intro is public. In mock mode the server needs no sign-in,
 * so this passes straight through.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, problem, recheck } = useAuth();
  const pathname = usePathname();

  if (pathname === "/" || status === "signed-in") return <>{children}</>;

  if (status === "checking") {
    return (
      <Centered>
        <Loading />
      </Centered>
    );
  }
  if (status === "offline") {
    return (
      <Centered>
        <Card style={{ gap: s(12) }}>
          <Title>Can’t reach FinPal</Title>
          <Text style={{ fontSize: ms(14), lineHeight: ms(21) }}>
            {problem}
          </Text>
          <Button label="Try again" onPress={recheck} variant="primary" />
        </Card>
      </Centered>
    );
  }
  return <SignIn />;
}

function Centered({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        padding: s(16),
        paddingTop: insets.top + s(16),
      }}
    >
      {children}
    </View>
  );
}

type Mode = "signin" | "signup" | "forgot";

function SignIn() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { canSignIn, signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    tone: "bad" | "ok";
  } | null>(null);

  const titles: Record<Mode, string> = {
    signin: "Sign in",
    signup: "Create account",
    forgot: "Reset password",
  };

  async function submit() {
    if (busy) return;
    if (!email.trim() || (mode !== "forgot" && !password)) {
      setMessage({
        text:
          mode === "forgot"
            ? "Enter your email."
            : "Enter your email and password.",
        tone: "bad",
      });
      return;
    }
    setBusy(true);
    setMessage(null);
    const problem =
      mode === "signin"
        ? await signIn(email, password)
        : mode === "signup"
          ? await signUp(email, password)
          : await resetPassword(email);
    setBusy(false);
    if (mode === "forgot" && !problem) {
      setMessage({
        text: "If that email has an account, a reset link is on its way.",
        tone: "ok",
      });
    } else if (problem) {
      // Sign-up with email confirmation "fails" with instructions, not an error.
      setMessage({
        text: problem,
        tone: /check your email/i.test(problem) ? "ok" : "bad",
      });
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: s(16),
          paddingTop: insets.top + s(16),
          paddingBottom: insets.bottom + s(24),
          gap: s(20),
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Logo size={ms(26)} />
          <ThemeToggle />
        </View>

        <Title>{titles[mode]}</Title>

        {!canSignIn ? (
          <Notice tone="warn">
            This build has no Supabase project configured, so it can’t sign in.
            Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see
            .env.example), or run the web app in mock mode.
          </Notice>
        ) : null}

        <Card style={{ gap: s(14) }}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={canSignIn}
          />
          {mode !== "forgot" ? (
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              editable={canSignIn}
              onSubmitEditing={submit}
            />
          ) : null}
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
          <Button
            label={titles[mode]}
            onPress={submit}
            variant="primary"
            busy={busy}
            disabled={!canSignIn}
          />
        </Card>

        <View style={{ gap: s(10), alignItems: "center" }}>
          {mode === "signin" ? (
            <>
              <Switch
                label="New here? Create an account"
                onPress={() => setMode("signup")}
              />
              <Switch
                label="Forgot your password?"
                onPress={() => setMode("forgot")}
              />
            </>
          ) : (
            <Switch label="Back to sign in" onPress={() => setMode("signin")} />
          )}
        </View>
        <Text
          style={{ color: colors.ink4, fontSize: ms(12), textAlign: "center" }}
        >
          Zero blind spends.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Switch({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8}>
      <Text
        style={{
          color: colors.brand,
          fontFamily: font.medium,
          fontSize: ms(14),
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
