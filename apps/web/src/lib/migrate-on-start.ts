import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";

import { runMigrations } from "@finpal/backend";

import { isMockMode } from "@/lib/data-source";
import { getDb } from "@/lib/db";

/**
 * Applies pending db/migrations before the server takes requests. Render's
 * free tier has no pre-deploy step, so the app migrates itself; a failure
 * stops the server rather than running against the wrong schema.
 */
export async function migrateOnStart() {
  if (isMockMode()) return;
  // The Docker image copies db/migrations beside server.js's working
  // directory; in development the app runs from apps/web.
  const cwd = /* turbopackIgnore: true */ process.cwd();
  const dir =
    process.env.MIGRATIONS_DIR ??
    [
      path.join(cwd, "db/migrations"),
      path.join(cwd, "../../db/migrations"),
    ].find((candidate) => existsSync(candidate));
  if (!dir) {
    console.warn("db/migrations not found; skipping database migrations.");
    return;
  }
  await runMigrations(getDb(), dir);
}
