import pg from "pg";

/** Anything that runs a query: a pool, or one client inside a transaction. */
export interface Db {
  query<Row extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<Row>>;
}

/**
 * One pool per server process. Sessions run in UTC so timestamps rendered to
 * JSON (to_jsonb) always carry a +00:00 offset and sort as strings.
 */
export function createPostgresPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    options: "-c TimeZone=UTC",
  });
  // An idle client losing its connection must not crash the process.
  pool.on("error", (error) => console.error("Postgres pool error", error));
  return pool;
}

const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

/**
 * Serializes a value for a `$n::jsonb` parameter. node-postgres would turn a
 * JS array into a Postgres array literal, so JSON is encoded explicitly;
 * null stays SQL NULL rather than the JSON literal null.
 */
export function json(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

/** The single `row` column of the first result row, or null. */
export async function queryRow(
  db: Db,
  text: string,
  values: unknown[],
): Promise<unknown> {
  const { rows } = await db.query<{ row: unknown }>(text, values);
  return rows[0]?.row ?? null;
}

export async function queryRows(
  db: Db,
  text: string,
  values: unknown[],
): Promise<unknown[]> {
  const { rows } = await db.query<{ row: unknown }>(text, values);
  return rows.map((r) => r.row);
}
