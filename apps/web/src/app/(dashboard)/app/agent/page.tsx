import Link from "next/link";

import { AgentConsole } from "@/features/agent/agent-console";
import { requireUser } from "@/lib/auth";
import { getUserConstraints } from "@/lib/backend";
import { isMockMode } from "@/lib/data-source";

export default async function AgentPage({
  searchParams,
}: {
  searchParams: Promise<{ need?: string }>;
}) {
  const user = await requireUser();
  const { need } = await searchParams;
  const constraints = await getUserConstraints(user.id);

  return (
    <div className="app-page">
      <div className="page-head__text">
        <h1>Agent</h1>
        <p>
          Drop your shopping list. The agent finds the best options, your rules
          check them, and you approve once.
        </p>
      </div>
      {!constraints ? (
        <p className="notice" data-tone="warn">
          You haven&apos;t set any rules yet, so you&apos;ll review everything
          the agent finds. <Link href="/app/rules">Set your rules →</Link>
        </p>
      ) : null}
      <AgentConsole
        timeZone={constraints?.timezone ?? "UTC"}
        sandbox={isMockMode()}
        initialList={need?.slice(0, 1000) ?? ""}
      />
    </div>
  );
}
