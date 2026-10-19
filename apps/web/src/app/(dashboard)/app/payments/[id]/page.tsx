import {
  PaymentsPage,
  type PaymentNotice,
} from "@/features/payments/payments-page";

export default async function PaymentRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<PaymentNotice>;
}) {
  const [{ id }, notice] = await Promise.all([params, searchParams]);
  return <PaymentsPage selectedId={id} notice={notice} />;
}
