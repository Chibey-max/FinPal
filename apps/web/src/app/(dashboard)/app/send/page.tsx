import Link from "next/link";
import type { WalletSummary } from "@finpal/contracts";

import { SendFundsPanel } from "@/features/send/send-funds-panel";
import { requireUser } from "@/lib/auth";
import { getSendFundsService, getUserConstraints } from "@/lib/backend";

export default async function SendPage() {
  const user = await requireUser();
  const constraints = await getUserConstraints(user.id);
  const send = getSendFundsService();

  let wallet: WalletSummary | null = null;
  try {
    wallet = await send.getWallet(user.id);
  } catch {
    wallet = null;
  }
  const sends = await send.listSends(user.id, 50);

  return (
    <div className="app-page">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Send</h1>
          <p>
            Connect PayPal, top up your personal FinPal balance, then send.
            Demo recipient emails often stay Unclaimed; use a Sandbox personal
            account email for Success.
          </p>
        </div>
      </div>
      {!constraints ? (
        <p className="notice" data-tone="warn">
          You haven&apos;t set any rules yet, so sends still need your approval.{" "}
          <Link href="/app/rules">Set your rules →</Link>
        </p>
      ) : null}
      <SendFundsPanel
        wallet={wallet}
        initialSends={sends}
        timeZone={constraints?.timezone ?? "UTC"}
      />
    </div>
  );
}
