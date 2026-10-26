"use client";

import type { SpendingForecast } from "@finpal/contracts";
import { useEffect, useState } from "react";

import { AutoAwesomeIcon } from "@/components/icons";
import { formatEventDate } from "@/features/app/present";
import { apiRequest, errorMessage } from "@/lib/api-client";

const LEVEL = {
  OK: { label: "On track", tone: "ok" },
  WATCH: { label: "Watch", tone: "warn" },
  WARN: { label: "Slow down", tone: "bad" },
} as const;

/**
 * Spending warnings before busy periods. Pace and headroom come from the
 * rules; Groq labels upcoming events and words the advice.
 */
export function ForecastCard({ timeZone }: { timeZone: string }) {
  const [forecast, setForecast] = useState<SpendingForecast | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    apiRequest<SpendingForecast>("/api/v1/forecast")
      .then((value) => live && setForecast(value))
      .catch((caught) => live && setError(errorMessage(caught)));
    return () => {
      live = false;
    };
  }, []);

  const level = forecast ? LEVEL[forecast.level] : null;
  return (
    <section
      className="card forecast-card"
      aria-labelledby="forecast-title"
      aria-busy={!forecast && !error}
    >
      <div className="summary-card__head">
        <AutoAwesomeIcon className="summary-card__icon" />
        <h3 id="forecast-title">Spending outlook</h3>
        {level ? (
          <span className="chip" data-tone={level.tone}>
            {level.label}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="summary-card__text ink3">{error}</p>
      ) : !forecast ? (
        <div className="summary-card__skeleton" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      ) : (
        <div className="fade-in stack-sm">
          <p className="summary-card__text">{forecast.advice}</p>
          <ul className="forecast-card__signals">
            {forecast.signals.map((signal) => (
              <li key={signal}>{signal}</li>
            ))}
          </ul>
          {forecast.busyEvents.length ? (
            <ul className="forecast-card__events">
              {forecast.busyEvents.map((event) => (
                <li key={event.id}>
                  <span className="chip" data-tone="info">
                    {event.category === "TRAVEL" ? "Travel" : "Celebration"}
                  </span>
                  <span className="truncate">{event.title}</span>
                  <span className="mono small ink4">
                    {formatEventDate(event.startsAt, timeZone)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="summary-card__note">
            {forecast.source === "llm"
              ? `Advice by Groq · ${forecast.model}. `
              : ""}
            Figures are calculated from your payments and caps.
          </p>
        </div>
      )}
    </section>
  );
}
