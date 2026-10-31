import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type pg from "pg";

// Any constant shared by every FinPal process; serializes concurrent runs.
const MIGRATION_LOCK = 724_001;

/**
 * Applies each `*.sql` file in `dir` not yet recorded in schema_migrations,
 * in name order, one transaction per file. Safe to run on every start.
 * Imports types only, so Node can run it directly (scripts/db.ts).
 */
export async function runMigrations(
  pool: pg.Pool,
  dir: string,
  log: (message: string) => void = console.log,
): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK]);
    await client.query(
      `create table if not exists public.schema_migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    );
    const { rows } = await client.query<{ name: string }>(
      "select name from public.schema_migrations",
    );
    const done = new Set(rows.map((row) => row.name));

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(dir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into public.schema_migrations (name) values ($1)",
          [file],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw new Error(
          `Migration ${file} failed: ${(error as Error).message}`,
          {
            cause: error,
          },
        );
      }
      applied.push(file);
      log(`Applied migration ${file}`);
    }
  } finally {
    await client
      .query("select pg_advisory_unlock($1)", [MIGRATION_LOCK])
      .catch(() => undefined);
    client.release();
  }
  return applied;
}
