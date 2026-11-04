import type { ActivityPage, AuditEvent } from "@finpal/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { Button, ChipRow } from "@/components/form";
import { useToast } from "@/components/toast";
import {
  Card,
  ErrorNotice,
  Loading,
  Screen,
  Text,
  Title,
} from "@/components/ui";
import { apiGet, errorMessage } from "@/lib/api";
import { entityShort, eventTone, summarizeEvent } from "@/lib/events";
import { formatWhen } from "@/lib/present";
import { ms, s } from "@/lib/screen";
import { useTheme } from "@/lib/theme-context";
import { useTimezone } from "@/lib/use-api";
import { mono } from "@/theme";

const FILTERS = {
  All: null,
  Decisions: /PROPOSAL|EVALUATION|DECISION/,
  Payments: /PAYMENT|PAYPAL/,
  Config: /CONSTRAINTS/,
} as const;
type FilterKey = keyof typeof FILTERS;

const PAGE = 30;

/** The audit trail, newest first. Events are never edited or deleted. */
export default function Activity() {
  const toast = useToast();
  const { colors } = useTheme();
  const timezone = useTimezone();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterKey>("All");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    try {
      const page = await apiGet<ActivityPage>(`/api/v1/activity?limit=${PAGE}`);
      setEvents(page.events);
      setNextBefore(page.nextBefore);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  async function more() {
    if (nextBefore === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await apiGet<ActivityPage>(
        `/api/v1/activity?limit=${PAGE}&before=${nextBefore}`,
      );
      setEvents((current) => [...current, ...page.events]);
      setNextBefore(page.nextBefore);
    } catch (caught) {
      toast(errorMessage(caught), "bad");
    } finally {
      setLoadingMore(false);
    }
  }

  const shown = useMemo(() => {
    const pattern = FILTERS[filter];
    return pattern
      ? events.filter((event) => pattern.test(event.type))
      : events;
  }, [events, filter]);

  return (
    <Screen refreshing={refreshing} onRefresh={() => void load(true)}>
      <View style={{ gap: s(8) }}>
        <Title>Activity</Title>
        <Text
          style={{ color: colors.ink3, fontSize: ms(14), lineHeight: ms(21) }}
        >
          Every step is logged. Events are never edited or deleted: a correction
          is a new event.
        </Text>
      </View>

      <ChipRow
        options={(Object.keys(FILTERS) as FilterKey[]).map((key) => ({
          value: key,
          label: key,
        }))}
        value={filter}
        onChange={setFilter}
      />

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorNotice message={error} onRetry={() => void load(false)} />
      ) : shown.length === 0 ? (
        <Card>
          <Text style={{ color: colors.ink2, fontSize: ms(14) }}>
            No events{filter === "All" ? " yet" : " in this filter"}.
          </Text>
        </Card>
      ) : (
        <Card style={{ padding: 0, gap: 0 }}>
          {shown.map((event, i) => (
            <View
              key={event.id}
              style={{
                gap: s(4),
                paddingVertical: s(13),
                paddingHorizontal: s(18),
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.hairline,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: s(10),
                }}
              >
                <Text
                  style={{
                    flexShrink: 1,
                    fontFamily: mono,
                    fontSize: ms(12),
                    color: colors.tones[eventTone(event)].color,
                  }}
                >
                  {event.type}
                </Text>
                <Text
                  style={{
                    fontFamily: mono,
                    fontSize: ms(11),
                    color: colors.ink4,
                  }}
                >
                  {entityShort(event)}
                </Text>
              </View>
              <Text
                style={{
                  color: colors.ink2,
                  fontSize: ms(13.5),
                  lineHeight: ms(19),
                }}
              >
                {summarizeEvent(event)}
              </Text>
              <Text style={{ color: colors.ink4, fontSize: ms(12) }}>
                {formatWhen(event.createdAt, timezone)}
              </Text>
            </View>
          ))}
        </Card>
      )}

      {nextBefore !== null && !loading && !error ? (
        <Button
          label="Load more"
          onPress={more}
          busy={loadingMore}
          style={{ alignSelf: "center" }}
        />
      ) : null}
    </Screen>
  );
}
