import type { AgentRun, Basket } from "@finpal/contracts";

/** Device-local Agent chat so refresh does not wipe the thread. */
export const AGENT_SESSION_KEY = "finpal-agent-session";

export type AgentChatTurn = {
  id: string;
  role: "user" | "agent";
  text: string;
};

export type AgentSession = {
  v: 1;
  list: string;
  turns: AgentChatTurn[];
  runs: AgentRun[];
  paid: Basket | null;
  excluded: string[];
  savedAt: number;
};

export function readAgentSession(): AgentSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AGENT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AgentSession;
    if (parsed?.v !== 1 || !Array.isArray(parsed.turns)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeAgentSession(session: Omit<AgentSession, "v" | "savedAt">) {
  if (typeof window === "undefined") return;
  try {
    const payload: AgentSession = {
      v: 1,
      savedAt: Date.now(),
      list: session.list,
      turns: session.turns.slice(-40),
      runs: session.runs,
      paid: session.paid,
      excluded: session.excluded,
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
