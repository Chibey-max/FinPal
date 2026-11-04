import { PaymentError } from "@finpal/backend";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { getPaymentService } from "@/lib/backend";

// Old payment links: a payment now lives on its purchase.
export default async function PaymentRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  let decisionId: string;
  try {
    ({ decisionId } = await getPaymentService().getPayment(user.id, id));
  } catch (error) {
    if (error instanceof PaymentError && error.code === "PAYMENT_NOT_FOUND") {
      notFound();
    }
    throw error;
  }
  redirect(`/app/purchases/${decisionId}`);
}
