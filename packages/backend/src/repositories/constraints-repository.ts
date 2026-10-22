import type { SpendingConstraints } from "@finpal/contracts";

export interface ConstraintsRepository {
  /** The user's constraints, or null if they have not set any yet. */
  get(userId: string): Promise<SpendingConstraints | null>;
  save(userId: string, constraints: SpendingConstraints): Promise<void>;
  /** Removes the user's constraints; a no-op if none are saved. */
  clear(userId: string): Promise<void>;
}
