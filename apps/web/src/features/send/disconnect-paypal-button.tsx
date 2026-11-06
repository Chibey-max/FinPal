"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";

/** Disconnect Log in with PayPal after confirm. */
export function DisconnectPaypalButton({
  label = "Disconnect",
  className = "btn btn-outline btn-sm",
}: {
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function submit() {
    setBusy(true);
    const form = document.createElement("form");
    form.method = "post";
    form.action = "/api/v1/paypal/disconnect";
    document.body.appendChild(form);
    form.submit();
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      <ConfirmDialog
        open={open}
        title="Disconnect PayPal?"
        description="You won’t be able to top up or send until you connect again. Your FinPal balance stays on file."
        confirmLabel="Disconnect"
        busyLabel="Disconnecting…"
        tone="danger"
        busy={busy}
        onCancel={() => {
          if (!busy) setOpen(false);
        }}
        onConfirm={submit}
      />
    </>
  );
}
