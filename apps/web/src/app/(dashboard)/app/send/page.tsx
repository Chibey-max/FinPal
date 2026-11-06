import Link from "next/link";
import type { WalletSummary } from "@finpal/contracts";

import { SendFundsPanel } from "@/features/send/send-funds-panel";
import { requireUser } from "@/lib/auth";
import { getSendFundsService, getUserConstraints } from "@/lib/backend";

export default async function SendPage() {
  const user = await requireUser();
  const constraints = await getUserConstraints(user.id);
  const send = getSendFundsService();

  // getWallet soft-fails to balanceStatus UNAVAILABLE when Reporting is off.
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
            Pay someone from the PayPal Sandbox wallet. Demo emails become
            Unclaimed (no PayPal account). Use a Sandbox personal account email
            for a claimed Success.
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
