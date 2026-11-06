import type { AgentRun, Basket, SendDraft } from "@finpal/contracts";

/** Device-local Agent chat so refresh does not wipe the thread. */
export const AGENT_SESSION_KEY = "finpal-agent-session";

export type AgentChatTurn = {
  id: string;
  role: "user" | "agent";
  text: string;
};

export type AgentSession = {
  v: 2;
  list: string;
  turns: AgentChatTurn[];
  runs: AgentRun[];
  paid: Basket | null;
  excluded: string[];
  sendDraft: SendDraft | null;
  savedAt: number;
};

export function readAgentSession(): AgentSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AGENT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      v?: number;
      list?: string;
      turns?: AgentChatTurn[];
      runs?: AgentRun[];
      paid?: Basket | null;
      excluded?: string[];
      sendDraft?: SendDraft | null;
      savedAt?: number;
    };
    if (!Array.isArray(parsed.turns)) return null;
    if (parsed.v !== 1 && parsed.v !== 2) return null;
    return {
      v: 2,
      list: parsed.list ?? "",
      turns: parsed.turns,
      runs: parsed.runs ?? [],
      paid: parsed.paid ?? null,
      excluded: parsed.excluded ?? [],
      sendDraft: parsed.sendDraft ?? null,
      savedAt: parsed.savedAt ?? Date.now(),
    };
  } catch {
    return null;
  }
}

export function writeAgentSession(
  session: Omit<AgentSession, "v" | "savedAt">,
) {
  if (typeof window === "undefined") return;
  try {
    const payload: AgentSession = {
      v: 2,
      savedAt: Date.now(),
      list: session.list,
      turns: session.turns.slice(-40),
      runs: session.runs,
      paid: session.paid,
      excluded: session.excluded,
      sendDraft: session.sendDraft,
    };
    localStorage.setItem(AGENT_SESSION_KEY, JSON.stringify(payload));
  } catch {
    // Quota / private mode — chat still works without persistence.
  }
}

export function clearAgentSession() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(AGENT_SESSION_KEY);
  } catch {
    // ignore
  }
}
