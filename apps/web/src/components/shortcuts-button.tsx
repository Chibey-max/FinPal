"use client";

import { OPEN_SHORTCUTS_EVENT } from "./app-shortcuts";

export function ShortcutsButton() {
  return (
    <button
      type="button"
      className="btn btn-outline btn-sm"
      onClick={() => dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT))}
    >
      Show shortcuts
    </button>
  );
}
