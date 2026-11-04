import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service · FinPal",
  description:
    "The terms for using FinPal, a PayPal Sandbox demonstration app.",
};

const CONTACT = "https://github.com/Chibey-max/FinPal/issues";

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="legal-updated">Last updated: 31 October 2026</p>

      <p>
        By using FinPal, you agree to these terms. If you don&apos;t agree,
        please don&apos;t use it.
      </p>

      <h2>What FinPal is</h2>
      <p>
        FinPal is a hackathon demonstration project. Its agent finds products,
        checks them against your spending rules and prepares payments for your
        approval.
      </p>

      <h2>No real money or real purchases</h2>
      <p>
        <strong>
          FinPal runs on PayPal Sandbox only. Payments are simulated: no real
          money moves, and no product is ordered, sold or delivered.
        </strong>{" "}
        Don&apos;t enter real card or bank details.
      </p>

      <h2>Not financial advice</h2>
      <p>
        Suggestions, explanations and spending advice are for demonstration.
        They aren&apos;t financial, legal or investment advice.
      </p>

      <h2>AI and third-party information</h2>
      <p>
        Parts of FinPal use AI, which can make mistakes. Prices and product
        details come from third parties and may be incomplete or out of date.
        FinPal&apos;s spending rules decide each outcome, but please check
        anything important yourself.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be at least 18.</li>
        <li>
          Keep your password safe. You&apos;re responsible for your account.
        </li>
        <li>
          Don&apos;t misuse FinPal: no attacking or overloading it, accessing
          other people&apos;s data, or using it for anything unlawful.
        </li>
      </ul>

      <h2>Google Calendar</h2>
      <p>
        Connecting Google Calendar is optional, and you can disconnect at any
        time. Our <Link href="/privacy">Privacy Policy</Link> explains how
        calendar data is used.
      </p>

      <h2>Availability</h2>
      <p>
        FinPal is provided &quot;as is&quot;, without warranties, and may
        change, pause or end at any time. Data may be deleted when the project
        ends.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, the FinPal team isn&apos;t liable for
        losses arising from using this demonstration project.
      </p>

      <h2>Changes</h2>
      <p>
        If these terms change, the date at the top will change too. Continuing
        to use FinPal means you accept the new terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions: <a href={CONTACT}>contact the FinPal team</a>.
      </p>
    </>
  );
}
