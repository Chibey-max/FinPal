import {
  PaymentsPage,
  type PaymentNotice,
} from "@/features/payments/payments-page";

export default async function PaymentsRoute({
  searchParams,
}: {
  searchParams: Promise<PaymentNotice>;
}) {
  return <PaymentsPage selectedId={null} notice={await searchParams} />;
}
