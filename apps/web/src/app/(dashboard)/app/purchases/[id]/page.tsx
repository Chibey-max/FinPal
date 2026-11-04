import {
  PurchaseDetailPage,
  type PurchasesParams,
} from "@/features/purchases/purchases-page";

export default async function PurchaseRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<PurchasesParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <PurchaseDetailPage id={id} params={query} />;
}
