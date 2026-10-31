import type { SessionRepository } from "../session-repository";
import type { UserRecord } from "../user-repository";
import type { Db } from "./db";

export function createPostgresSessionRepository(db: Db): SessionRepository {
  return {
    async create(tokenHash, userId, expiresAt) {
      await db.query(
        `insert into public.sessions (token_hash, user_id, expires_at)
         values ($1, $2, $3)`,
        [tokenHash, userId, expiresAt.toISOString()],
      );
    },

    async findUser(tokenHash, now) {
      const { rows } = await db.query<{
        id: string;
        email: string;
        display_name: string | null;
      }>(
        `select u.id, u.email, u.display_name
         from public.sessions s join public.users u on u.id = s.user_id
         where s.token_hash = $1 and s.expires_at > $2`,
        [tokenHash, now.toISOString()],
      );
      const row = rows[0];
      if (!row) return null;
      const user: UserRecord = {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
      };
      return user;
    },

    async delete(tokenHash) {
      await db.query("delete from public.sessions where token_hash = $1", [
        tokenHash,
      ]);
    },

    async deleteForUser(userId) {
      await db.query("delete from public.sessions where user_id = $1", [
        userId,
      ]);
    },

    async deleteExpired(now) {
      await db.query("delete from public.sessions where expires_at <= $1", [
        now.toISOString(),
      ]);
    },
  };
}
