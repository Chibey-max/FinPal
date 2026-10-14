import { z } from "zod";

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
});

export const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PAYPAL_API_BASE_URL: z
    .url()
    .default("https://api-m.sandbox.paypal.com")
    .refine((url) => new URL(url).hostname.includes("sandbox"), {
      message:
        "FinPal is Sandbox-only; PAYPAL_API_BASE_URL must be a sandbox host.",
    }),
  PAYPAL_WEBHOOK_ID: z.string().min(1).optional(),
  CHANNEL3_API_KEY: z.string().min(1),
  KERNEL_API_KEY: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
