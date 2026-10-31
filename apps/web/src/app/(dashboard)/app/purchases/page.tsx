import {
  PurchasesPage,
  type PurchasesParams,
} from "@/features/purchases/purchases-page";

export default async function PurchasesRoute({
  searchParams,
}: {
  searchParams: Promise<PurchasesParams>;
}) {
  return <PurchasesPage selectedId={null} params={await searchParams} />;
}
