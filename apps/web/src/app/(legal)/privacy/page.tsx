import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy · FinPal",
  description:
    "What FinPal collects, why, who it shares it with, and your choices.",
};

const CONTACT = "https://github.com/Chibey-max/FinPal/issues";

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated: 31 October 2026</p>

      <p>
        FinPal is a hackathon project: a shopping agent that checks purchases
        against your spending rules before paying through PayPal Sandbox. It
        uses simulated money only. This page explains what it collects, why, and
        who it shares it with.
      </p>

      <h2>What FinPal collects</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your email address and a password,
          which is handled by our sign-in provider. FinPal doesn&apos;t store
          your password itself.
        </li>
        <li>
          <strong>Your spending rules:</strong> budgets, allowed times, currency
          and timezone.
        </li>
        <li>
          <strong>Your shopping activity:</strong> what you ask the agent for,
          the products and prices it finds, each decision and why it was made,
          your approvals, and an audit log of these steps.
        </li>
        <li>
          <strong>Payment records:</strong> amounts and PayPal Sandbox order and
          payment references. FinPal never sees or stores card or bank details.
        </li>
        <li>
          <strong>Google Calendar, only if you connect it:</strong> see below.
        </li>
      </ul>

      <h2>Google Calendar</h2>
      <p>
        Connecting your calendar is optional. If you do, FinPal asks Google for
        read-only access (<code>calendar.readonly</code>) and can&apos;t change
        your calendar.
      </p>
      <ul>
        <li>
          <strong>What it reads:</strong> the title, start time and ID of your
          upcoming events on your primary calendar. It doesn&apos;t use
          attendees, descriptions or locations.
        </li>
        <li>
          <strong>Why:</strong> to show your events on your Rules screen, to
          suggest things you might need for them, and to warn you about busy
          periods ahead.
        </li>
        <li>
          <strong>What it stores:</strong> an encrypted Google token, so it can
          keep reading your events. Event titles and times are read when needed
          and aren&apos;t saved as a calendar copy. If you start a purchase from
          an event, that event&apos;s ID is kept with the purchase.
        </li>
        <li>
          <strong>Sharing:</strong> event titles, dates and IDs are sent to
          Groq, our AI provider, to produce suggestions and advice. They
          aren&apos;t shared with anyone else, sold, or used for advertising.
        </li>
        <li>
          <strong>Stopping:</strong> choose <em>Disconnect Google Calendar</em>{" "}
          on the Rules screen. FinPal then cancels its access with Google and
          deletes the token. You can also remove access in your{" "}
          <a href="https://myaccount.google.com/permissions">
            Google Account settings
          </a>
          .
        </li>
      </ul>
      <p>
        FinPal&apos;s use of information received from Google APIs adheres to
        the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2>Who FinPal shares data with</h2>
      <p>Only the services it needs to work, and only what each one needs:</p>
      <ul>
        <li>
          <strong>Groq (AI):</strong> your shopping requests, product titles and
          prices, past purchase titles and prices, spending figures and calendar
          event titles, dates and IDs. Your name, email and account ID are not
          sent.
        </li>
        <li>
          <strong>Channel3:</strong> product search terms and currency, to find
          prices.
        </li>
        <li>
          <strong>KERNEL:</strong> merchant web addresses, to check that a
          merchant&apos;s site works.
        </li>
        <li>
          <strong>PayPal Sandbox:</strong> item names and amounts, to create and
          complete simulated payments.
        </li>
        <li>
          <strong>Supabase:</strong> stores your account and FinPal data.
        </li>
        <li>
          <strong>Render:</strong> hosts the app.
        </li>
      </ul>
      <p>
        FinPal doesn&apos;t sell your data, show ads or use analytics or
        tracking tools.
      </p>

      <h2>Cookies and browser storage</h2>
      <p>
        FinPal uses cookies to keep you signed in and to protect the calendar
        connection step, and stores your light or dark theme choice in your
        browser. It uses no advertising cookies.
      </p>

      <h2>How long data is kept</h2>
      <p>
        Your data is kept while your account exists. The audit log can&apos;t be
        edited, because it&apos;s the record of what the agent did, so it may be
        kept for as long as the project runs. This is a hackathon project, and
        its data may be deleted when the project ends.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Change or turn off your spending rules at any time.</li>
        <li>Disconnect Google Calendar at any time.</li>
        <li>
          Ask us what data we hold about you, or ask us to correct or delete it,
          by contacting us below. Audit records may be anonymized rather than
          deleted.
        </li>
      </ul>

      <h2>Security</h2>
      <p>
        Data is sent over encrypted connections, each account can only see its
        own records, and Google tokens are encrypted when stored. No system is
        perfectly secure, so please don&apos;t enter sensitive information into
        your shopping requests.
      </p>

      <h2>Children</h2>
      <p>FinPal isn&apos;t intended for anyone under 18.</p>

      <h2>Changes</h2>
      <p>If this policy changes, the date at the top will change too.</p>

      <h2>Contact</h2>
      <p>
        Questions or requests: <a href={CONTACT}>contact the FinPal team</a>.
        See also our <Link href="/terms">Terms of Service</Link>.
      </p>
    </>
  );
}
