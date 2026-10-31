"use client";

import { useActionState, useId, useState, type ReactNode } from "react";

import { VisibilityIcon, VisibilityOffIcon } from "@/components/icons";
import { LiquidButton } from "@/components/ui/liquid-glass-button";

import { signIn, signUp, type AuthFormState } from "./actions";

const initial: AuthFormState = {};

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  invalid,
  errorId,
  hint,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: "email" | "password" | "text";
  autoComplete: string;
  invalid?: boolean;
  errorId?: string;
  hint?: ReactNode;
  defaultValue?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  return (
    <div className="auth-field">
      <div className="auth-field__label">
        <label htmlFor={id}>{label}</label>
        {hint}
      </div>
      <div className="auth-field__control">
        <input
          id={id}
          name={name}
          className="input"
          type={
            isPassword && !visible ? "password" : isPassword ? "text" : type
          }
          autoComplete={autoComplete}
          required
          minLength={isPassword ? 8 : undefined}
          defaultValue={defaultValue}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          spellCheck={false}
        />
        {isPassword ? (
          <button
            type="button"
            className="auth-field__reveal"
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
          >
            {visible ? <VisibilityOffIcon /> : <VisibilityIcon />}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Feedback({ state, id }: { state: AuthFormState; id: string }) {
  if (state.error) {
    return (
      <p id={id} className="auth-feedback" data-tone="bad" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p className="auth-feedback" data-tone="ok" role="status">
        {state.message}
      </p>
    );
  }
  return null;
}

function Submit({
  pending,
  idle,
  busy,
}: {
  pending: boolean;
  idle: string;
  busy: string;
}) {
  return (
    <LiquidButton
      type="submit"
      size="xl"
      className="w-full rounded-full text-[15px]"
      disabled={pending}
    >
      {pending ? <span className="spinner" aria-hidden /> : null}
      {pending ? busy : idle}
    </LiquidButton>
  );
}

/** Sign in and create account on one card, switched by a segmented toggle. */
export function LoginForm({
  next,
  initialMode = "signin",
}: {
  next?: string;
  initialMode?: "signin" | "signup";
}) {
  const [mode, setMode] = useState(initialMode);
  const [signInState, signInAction, signingIn] = useActionState(
    signIn,
    initial,
  );
  const [signUpState, signUpAction, signingUp] = useActionState(
    signUp,
    initial,
  );
  const state = mode === "signin" ? signInState : signUpState;
  const pending = signingIn || signingUp;
  const errorId = useId();
  const shown = state;

  return (
    <div className="auth-card__body">
      <div className="auth-head">
        <h1>{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
        <p>
          {mode === "signin"
            ? "Sign in to review decisions and payments."
            : "Set your spending rules once. FinPal checks every purchase against them."}
        </p>
      </div>

      <div className="segmented auth-toggle" role="group" aria-label="Account">
        <button
          type="button"
          aria-pressed={mode === "signin"}
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
        <button
          type="button"
          aria-pressed={mode === "signup"}
          onClick={() => setMode("signup")}
        >
          Create account
        </button>
      </div>

      <form
        key={mode}
        action={mode === "signin" ? signInAction : signUpAction}
        className="auth-form"
        noValidate
      >
        <input type="hidden" name="next" value={next ?? ""} />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          invalid={shown.field === "email"}
          errorId={errorId}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          invalid={shown.field === "password"}
          errorId={errorId}
          hint={
            mode === "signup" ? (
              <span className="auth-hint">At least 8 characters</span>
            ) : undefined
          }
        />
        <Feedback state={shown} id={errorId} />
        <Submit
          pending={pending}
          idle={mode === "signin" ? "Sign in" : "Create account"}
          busy={mode === "signin" ? "Signing in…" : "Creating account…"}
        />
      </form>
    </div>
  );
}
