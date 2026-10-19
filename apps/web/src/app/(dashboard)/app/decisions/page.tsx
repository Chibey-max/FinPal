import { DecisionsPage } from "@/features/decisions/decisions-page";

export default async function DecisionsRoute({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  return <DecisionsPage selectedId={null} pageParam={page} />;
}
