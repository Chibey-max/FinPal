import {
  DuplicateEmailError,
  type UserRecord,
  type UserRepository,
  type UserWithPassword,
} from "../user-repository";
import { isUniqueViolation, type Db } from "./db";

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  password_hash: string | null;
}

const toUser = (row: UserRow): UserRecord => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
});

export function createPostgresUserRepository(db: Db): UserRepository {
  return {
    async create(user) {
      try {
        const { rows } = await db.query<UserRow>(
          `insert into public.users (email, password_hash, display_name)
           values (lower($1), $2, $3)
           returning id, email, display_name, password_hash`,
          [user.email, user.passwordHash, user.displayName],
        );
        return toUser(rows[0]!);
      } catch (error) {
        if (isUniqueViolation(error)) throw new DuplicateEmailError();
        throw error;
      }
    },

    async findByEmail(email): Promise<UserWithPassword | null> {
      const { rows } = await db.query<UserRow>(
        `select id, email, display_name, password_hash
         from public.users where email = lower($1)`,
        [email],
      );
      const row = rows[0];
      return row ? { ...toUser(row), passwordHash: row.password_hash } : null;
    },

    async setPasswordHash(userId, passwordHash) {
      await db.query(
        "update public.users set password_hash = $2 where id = $1",
        [userId, passwordHash],
      );
    },
  };
}
