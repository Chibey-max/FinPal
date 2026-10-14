import { z } from "zod";

export const paymentStatusSchema = z.enum([
  "CREATED",
  "APPROVED",
  "AUTHORIZED",
  "CAPTURED",
  "VOIDED",
  "REFUNDED",
]);

export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
