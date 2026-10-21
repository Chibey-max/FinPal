import { useCallback, useEffect, useState } from "react";

import { apiGet } from "@/lib/api";

export type ApiState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
};

/** GETs `path` on mount; `refresh` re-fetches without blanking the screen. */
export function useApi<T>(path: string): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      try {
        setData(await apiGet<T>(path));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [path],
  );

  useEffect(() => {
    setLoading(true);
    void load(false);
  }, [load]);

  const refresh = useCallback(() => void load(true), [load]);
  return { data, error, loading, refreshing, refresh };
}

/** The user's configured timezone (falls back to UTC while it loads). */
export function useTimezone() {
  const { data } = useApi<{ timezone: string }>("/api/v1/summary");
  return data?.timezone ?? "UTC";
}
