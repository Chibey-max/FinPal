"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { signIn, signUp, type AuthFormState } from "./actions";

const initialState: AuthFormState = {};

export function LoginForm({
  next,
  callbackError,
}: {
  next?: string;
  callbackError?: boolean;
}) {
  const [signInState, signInAction, signingIn] = useActionState(
    signIn,
    initialState,
  );
  const [signUpState, signUpAction, signingUp] = useActionState(
    signUp,
    initialState,
  );
  const pending = signingIn || signingUp;
  const error =
    signInState.error ??
    signUpState.error ??
    (callbackError
      ? "That sign-in link is invalid or has expired."
      : undefined);

  return (
    <form className="grid gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={8}
          required
        />
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {signUpState.message ? (
        <p role="status" className="text-muted-foreground text-sm">
          {signUpState.message}
        </p>
      ) : null}

      <div className="grid gap-2">
        <Button type="submit" formAction={signInAction} disabled={pending}>
          {signingIn ? "Signing in…" : "Sign in"}
        </Button>
        <Button
          type="submit"
          variant="outline"
          formAction={signUpAction}
          disabled={pending}
        >
          {signingUp ? "Creating account…" : "Create account"}
        </Button>
      </div>
    </form>
  );
}
