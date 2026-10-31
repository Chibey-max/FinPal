export interface UserRecord {
  id: string;
  email: string;
  displayName: string | null;
}

export interface UserWithPassword extends UserRecord {
  /** Null for accounts imported from Supabase until a password is set. */
  passwordHash: string | null;
}

export interface NewUser {
  email: string;
  passwordHash: string;
  displayName: string | null;
}

/** Thrown by create() when the email is already registered. */
export class DuplicateEmailError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "DuplicateEmailError";
  }
}

export interface UserRepository {
  /** Emails are compared lower-cased. */
  create(user: NewUser): Promise<UserRecord>;
  findByEmail(email: string): Promise<UserWithPassword | null>;
  setPasswordHash(userId: string, passwordHash: string): Promise<void>;
}
