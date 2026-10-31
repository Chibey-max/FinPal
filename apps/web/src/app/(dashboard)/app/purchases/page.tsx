import {
  PurchasesPage,
  type PurchasesParams,
} from "@/features/purchases/purchases-page";

export default async function PurchasesRoute({
  searchParams,
}: {
  searchParams: Promise<PurchasesParams>;
}) {
  return <PurchasesPage params={await searchParams} />;
}
