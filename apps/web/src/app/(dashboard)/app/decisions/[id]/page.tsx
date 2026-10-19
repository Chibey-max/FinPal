import { DecisionsPage } from "@/features/decisions/decisions-page";

export default async function DecisionRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ id }, { page }] = await Promise.all([params, searchParams]);
  return <DecisionsPage selectedId={id} pageParam={page} />;
}
