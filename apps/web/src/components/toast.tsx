"use client";

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

export type ToastTone = "ok" | "bad";

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(
  () => undefined,
);

const TOAST_MS = 3600;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  };

  const show = useCallback((message: string, tone: ToastTone = "ok") => {
    clearTimers();
    setLeaving(false);
    setToast({ id: Date.now(), message, tone });
    timers.current = [
      window.setTimeout(() => setLeaving(true), TOAST_MS - 200),
      window.setTimeout(() => setToast(null), TOAST_MS),
    ];
  }, []);

  useEffect(() => clearTimers, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toast ? (
          <div
            key={toast.id}
            className="toast"
            data-tone={toast.tone}
            data-leaving={leaving || undefined}
            role={toast.tone === "bad" ? "alert" : "status"}
          >
            {toast.message}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Shows one toast when the page mounts, e.g. after a PayPal redirect. */
export function FlashToast({
  message,
  tone = "ok",
}: {
  message: string;
  tone?: ToastTone;
}) {
  const toast = useToast();
  useEffect(() => {
    toast(message, tone);
  }, [message, tone, toast]);
  return null;
}
