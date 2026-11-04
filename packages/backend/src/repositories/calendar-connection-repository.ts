export interface CalendarConnectionRecord {
  userId: string;
  refreshTokenEncrypted: string;
  needsReconnect: boolean;
}

/** Service role only: this table holds each user's encrypted Google token. */
export interface CalendarConnectionRepository {
  get(userId: string): Promise<CalendarConnectionRecord | null>;
  /** Connecting again replaces the token and clears needsReconnect. */
  save(userId: string, refreshTokenEncrypted: string): Promise<void>;
  markNeedsReconnect(userId: string): Promise<void>;
  remove(userId: string): Promise<void>;
}
