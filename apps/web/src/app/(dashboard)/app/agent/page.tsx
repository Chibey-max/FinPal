import Link from "next/link";

import { AgentConsole } from "@/features/agent/agent-console";
import { requireUser } from "@/lib/auth";
import { getUserConstraints } from "@/lib/backend";

export default async function AgentPage() {
  const user = await requireUser();
  const constraints = await getUserConstraints(user.id);

  return (
    <div className="app-page">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Agent</h1>
          <p>
            Tell FinPal what you need. The agent searches real offers, picks one
            and submits it, and your rules decide what happens next.
          </p>
        </div>
      </div>
      {!constraints ? (
        <p className="notice" data-tone="warn">
          No spending rules are set, so every agent purchase goes to manual
          review. <Link href="/app/constraints">Set your rules</Link>, or
          describe them in a sentence.
        </p>
      ) : null}
      <AgentConsole timeZone={constraints?.timezone ?? "UTC"} />
    </div>
  );
}
