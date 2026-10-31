import "server-only";

import { createPostgresPool } from "@finpal/backend";

import { getDatabaseUrl } from "@/lib/env.server";

// One connection pool per server process, kept on globalThis so development
// hot reloads reuse it instead of opening new connections each time.
const globalForDb = globalThis as {
  finpalPool?: ReturnType<typeof createPostgresPool>;
};

export function getDb() {
  globalForDb.finpalPool ??= createPostgresPool(getDatabaseUrl());
  return globalForDb.finpalPool;
}
