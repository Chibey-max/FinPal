import Link from "next/link";

import { ShortcutsButton } from "@/components/shortcuts-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireUser } from "@/lib/auth";
import {
  getAssistantService,
  getCalendarConnectionService,
  getCalendarEvents,
} from "@/lib/backend";
import { isMockMode } from "@/lib/data-source";

export default async function SettingsPage() {
  const user = await requireUser();
  const calendar = await getCalendarEvents(user.id, 1);
  const canConnect = getCalendarConnectionService() !== null;
  const mock = isMockMode();
  const ai = getAssistantService();

  return (
    <div className="app-page settings-page">
      <div className="page-head__text">
        <h1>Settings</h1>
        <p>Your account, connected services and preferences.</p>
      </div>

      <section className="card settings-card" aria-labelledby="account">
        <h2 id="account">Account</h2>
        <div className="settings-row">
          <div>
            <span className="settings-row__title">Email</span>
            <span className="small ink3">{user.email ?? "Demo account"}</span>
          </div>
        </div>
        {mock ? null : (
          <div className="settings-row">
            <div>
              <span className="settings-row__title">Password</span>
              <span className="small ink3">Choose a new sign-in password.</span>
            </div>
            <Link href="/reset-password" className="btn btn-outline btn-sm">
              Change password
            </Link>
          </div>
        )}
        {mock ? null : (
          <div className="settings-row">
            <div>
              <span className="settings-row__title">Sign out</span>
              <span className="small ink3">
                End this session on this device.
              </span>
            </div>
            <form action="/auth/signout" method="post">
              <button type="submit" className="btn btn-outline btn-sm">
                Sign out
              </button>
            </form>
          </div>
        )}
      </section>

      <section className="card settings-card" aria-labelledby="connections">
        <h2 id="connections">Connections</h2>
        <div className="settings-row">
          <div>
            <span className="settings-row__title">Google Calendar</span>
            <span className="small ink3">
              {calendar.needsReconnect
                ? "Google ended this connection. Connect again to see your events."
                : calendar.configured
                  ? "Connected. FinPal reads event titles and times only."
                  : "Lets the agent suggest what you might need for upcoming events."}
            </span>
          </div>
          {!canConnect ? (
            <span
              className="chip"
              data-tone={calendar.configured ? "ok" : "muted"}
            >
              {calendar.configured ? "Sample data" : "Unavailable"}
            </span>
          ) : calendar.configured ? (
            <form action="/api/v1/calendar/disconnect" method="post">
              <button type="submit" className="btn btn-outline btn-sm">
                Disconnect
              </button>
            </form>
          ) : (
            <a
              href="/api/v1/calendar/connect"
              className="btn btn-outline btn-sm"
            >
              {calendar.needsReconnect ? "Reconnect" : "Connect"}
            </a>
          )}
        </div>
        <div className="settings-row">
          <div>
            <span className="settings-row__title">PayPal</span>
            <span className="small ink3">
              Sandbox only. You approve each basket in PayPal, and no real money
              moves.
            </span>
          </div>
          <span className="chip" data-tone="info">
            Sandbox
          </span>
        </div>
        <div className="settings-row">
          <div>
            <span className="settings-row__title">AI assistant</span>
            <span className="small ink3">
              {ai.configured
                ? `Groq · ${ai.model}. It shops and explains; your rules decide.`
                : "Off. FinPal uses built-in rules instead."}
            </span>
          </div>
          <span className="chip" data-tone={ai.configured ? "ok" : "muted"}>
            {ai.configured ? "On" : "Off"}
          </span>
        </div>
      </section>

      <section className="card settings-card" aria-labelledby="preferences">
        <h2 id="preferences">Preferences</h2>
        <div className="settings-row">
          <div>
            <span className="settings-row__title">Appearance</span>
            <span className="small ink3">Switch between light and dark.</span>
          </div>
          <ThemeToggle />
        </div>
        <div className="settings-row">
          <div>
            <span className="settings-row__title">Keyboard shortcuts</span>
            <span className="small ink3">
              Search, move between pages and collapse the sidebar without the
              mouse.
            </span>
          </div>
          <ShortcutsButton />
        </div>
        <div className="settings-row">
          <div>
            <span className="settings-row__title">Spending rules</span>
            <span className="small ink3">
              Budgets, allowed hours, currency and timezone.
            </span>
          </div>
          <Link href="/app/rules" className="btn btn-outline btn-sm">
            Edit rules
          </Link>
        </div>
      </section>

      <section className="card settings-card" aria-labelledby="legal">
        <h2 id="legal">Legal</h2>
        <div className="settings-row">
          <span className="settings-row__title">Privacy Policy</span>
          <Link href="/privacy" className="link-quiet">
            Read
          </Link>
        </div>
        <div className="settings-row">
          <span className="settings-row__title">Terms of Service</span>
          <Link href="/terms" className="link-quiet">
            Read
          </Link>
        </div>
      </section>
    </div>
  );
}
