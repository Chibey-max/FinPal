"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";

/** Disconnect Google Calendar after a deliberate confirm. */
export function DisconnectCalendarButton({
  label = "Disconnect Google Calendar",
  className = "link-quiet",
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
    form.action = "/api/v1/calendar/disconnect";
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
        title="Disconnect Google Calendar?"
        description="FinPal will stop reading your events. You can connect again any time."
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
