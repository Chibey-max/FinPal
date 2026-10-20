import { DecisionsPage } from "@/features/decisions/decisions-page";

export default async function DecisionRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DecisionsPage selectedId={id} />;
}
