// Audit payloads are permanent and shown to users, so secrets must never
// reach them. Sensitive keys are redacted at any depth. Matching is on the
// whole key or its suffix, so "paypalAuthorizationId" (an audit fact) is kept
// while "Authorization" (an HTTP header) and "accessToken" are redacted.
const sensitiveExact = new Set(["authorization", "proxyauthorization"]);
const sensitiveSuffix =
  /(secret|password|passwd|token|apikey|cookie|credential|credentials|privatekey)$/;

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return sensitiveExact.has(normalized) || sensitiveSuffix.test(normalized);
}

const MAX_DEPTH = 6;
const MAX_STRING = 2_000;
const MAX_ARRAY = 100;

export const REDACTED = "[REDACTED]";

function clean(value: unknown, depth: number): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    return value.length > MAX_STRING
      ? `${value.slice(0, MAX_STRING)}…[truncated]`
      : value;
  }
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return "[TRUNCATED]";

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY)
      .map((item) => clean(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        result[key] = REDACTED;
        continue;
      }
      const cleaned = clean(item, depth + 1);
      if (cleaned !== undefined) result[key] = cleaned;
    }
    return result;
  }
  // undefined, functions, symbols, bigints: not JSON, drop them.
  return undefined;
}

/** Returns a JSON-safe copy with sensitive keys redacted and sizes bounded. */
export function sanitizeAuditPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return clean(payload, 0) as Record<string, unknown>;
}
