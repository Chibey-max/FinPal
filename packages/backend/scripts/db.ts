// Database commands, run with Node's built-in TypeScript support:
//   pnpm db:migrate                      apply db/migrations
//   pnpm db:set-password you@example.com set a password (prompts for it)
// Both read DATABASE_URL from the environment or the root .env.local.
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { runMigrations } from "../src/db/migrate.ts";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/services/auth.ts";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

/** Reads a line from the terminal without echoing it. */
function readHidden(prompt: string): Promise<string> {
  const { stdin, stdout } = process;
  stdout.write(prompt);
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      let data = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (chunk) => (data += chunk));
      stdin.on("end", () => resolve(data.split("\n")[0] ?? ""));
    });
  }
  return new Promise((resolve) => {
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (key: string) => {
      if (key === "\r" || key === "\n") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        stdout.write("\n");
        resolve(value);
      } else if (key === "\u0003") {
        process.exit(130);
      } else if (key === "\u007f") {
        value = value.slice(0, -1);
      } else {
        value += key;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const [command, email] = process.argv.slice(2);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const pool = new pg.Pool({ connectionString });
  try {
    if (command === "migrate") {
      const applied = await runMigrations(
        pool,
        path.join(root, "db/migrations"),
      );
      if (applied.length === 0) console.log("Database is up to date.");
    } else if (command === "set-password" && email) {
      const password = await readHidden("New password: ");
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      }
      const { rowCount } = await pool.query(
        "update public.users set password_hash = $2 where email = lower($1)",
        [email, await hashPassword(password)],
      );
      if (rowCount !== 1) throw new Error(`No account for ${email}.`);
      // Existing sessions end, as after any password change.
      await pool.query(
        "delete from public.sessions where user_id = (select id from public.users where email = lower($1))",
        [email],
      );
      console.log(`Password set for ${email}.`);
    } else {
      console.error("Usage: db.ts migrate | db.ts set-password <email>");
      process.exitCode = 2;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
