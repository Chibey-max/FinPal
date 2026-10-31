import Link from "next/link";

import { FlashToast } from "@/components/toast";
import { formatEventDate, formatMoney } from "@/features/app/present";
import { ProposalForm } from "@/features/proposals/proposal-form";
import {
  PRESETS,
  type EventContext,
  type PresetKey,
  type ProposalDraft,
} from "@/features/proposals/presets";
import { requireUser } from "@/lib/auth";
import {
  getAssistantService,
  getCalendarEvents,
  getSpendSummary,
  getUserConstraints,
} from "@/lib/backend";
import { isMockMode } from "@/lib/data-source";
import { CATALOG } from "@/lib/mock/integrations";
import { localDate, localTimeOfDay } from "@/lib/zoned";

const BASE_CURRENCIES = ["USD", "EUR", "GBP"];

const getAssistantModel = () => getAssistantService().model;

export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; event?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const constraints = await getUserConstraints(user.id);
  const [spend, events] = await Promise.all([
    getSpendSummary(user.id, constraints),
    params.event
      ? getCalendarEvents(50).then((page) => page.events)
      : Promise.resolve([]),
  ]);
  const timeZone = constraints?.timezone ?? "America/Los_Angeles";
  const currency = constraints?.currency ?? "USD";
  const mock = isMockMode();

  const preset =
    params.preset && Object.hasOwn(PRESETS, params.preset)
      ? PRESETS[params.preset as PresetKey]
      : null;
  const found = events.find((event) => event.id === params.event);
  const event: EventContext | null = found
    ? {
        id: found.id,
        title: found.title,
        date: localDate(new Date(found.startsAt), timeZone),
        time: localTimeOfDay(new Date(found.startsAt), timeZone),
        label: formatEventDate(found.startsAt, timeZone),
      }
    : null;

  const initial: ProposalDraft = event
    ? {
        name: "",
        price: "",
        currency,
        source: "CALENDAR",
        time: event.time,
        trust: "NOT_CHECKED",
      }
    : { ...(preset?.draft ?? PRESETS.auto.draft), source: "MANUAL" };

  const caps = constraints?.amountCaps;
  const windows = constraints?.timeWindows ?? [];
  const rules = constraints
    ? [
        {
          k: "Window",
          v: windows.length
            ? `${windows[0]!.start}–${windows[0]!.end}${windows.length > 1 ? ` +${windows.length - 1}` : ""}`
            : "Any time",
        },
        { k: "Timezone", v: constraints.timezone },
        { k: "Per transaction", v: formatMoney(caps!.perPurchase, currency) },
        {
          k: "Daily left",
          v: caps?.daily
            ? formatMoney(Math.max(0, caps.daily - spend.spentToday), currency)
            : "No cap",
        },
        {
          k: "Monthly left",
          v: caps?.monthly
            ? formatMoney(
                Math.max(0, caps.monthly - spend.spentThisMonth),
                currency,
              )
            : "No cap",
        },
        { k: "Currency", v: currency },
      ]
    : [{ k: "Constraints", v: "None · review only" }];

  return (
    <div className="app-page">
      {event ? (
        <FlashToast message="Prefilled from event. Product name and price are still required." />
      ) : null}
      <div className="proposal-layout">
        <div className="stack-lg">
          <div className="page-head__text">
            <h1>Add one item</h1>
            <p>
              Enter it yourself and your rules check it. Nothing is paid until
              you approve.{" "}
              <Link href="/app" className="link-quiet">
                Or let the agent shop
              </Link>
            </p>
          </div>
          <ProposalForm
            key={params.event ?? params.preset ?? "blank"}
            initial={initial}
            event={event}
            timeZone={timeZone}
            currencies={[...new Set([currency, ...BASE_CURRENCIES])]}
            simulateTrust={mock}
            catalog={mock ? CATALOG.map((item) => item.title) : []}
            presetActive={Boolean(preset)}
            assistantModel={getAssistantModel()}
          />
        </div>
        <aside
          className="card stack-card rules-card"
          aria-label="Rules in force"
        >
          <span className="eyebrow">Rules in force</span>
          {rules.map((rule) => (
            <div key={rule.k} className="kv-row">
              <span>{rule.k}</span>
              <span className="mono">{rule.v}</span>
            </div>
          ))}
          <Link href="/app/rules" className="link-quiet small">
            Edit constraints →
          </Link>
        </aside>
      </div>
    </div>
  );
}
