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
    .refine(
      (url) => {
        const parsed = new URL(url);
        return (
          parsed.protocol === "https:" &&
          parsed.hostname.endsWith(".sandbox.paypal.com")
        );
      },
      {
        message:
          "FinPal is Sandbox-only; PAYPAL_API_BASE_URL must be an https *.sandbox.paypal.com host.",
      },
    ),
  PAYPAL_WEBHOOK_ID: z.string().min(1).optional(),
  CHANNEL3_API_KEY: z.string().min(1),
  KERNEL_API_KEY: z.string().min(1).optional(),
  /** Google OAuth client, so each user can connect their own calendar. */
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  /** Groq key for plain-language explanations and proposal drafts. */
  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_MODEL: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
