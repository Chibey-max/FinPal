import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center px-6 py-16">
      <section>
        <p className="text-primary text-sm font-semibold tracking-widest uppercase">
          FinPal
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Financial Agent Buddy
        </h1>
        <p className="text-muted-foreground mt-4 max-w-2xl text-lg">
          Every purchase is checked against your spending rules, compared with
          market prices, and only then authorized through PayPal Sandbox.
        </p>
        <Link
          href="/dashboard"
          className={buttonVariants({ className: "mt-8" })}
        >
          Open dashboard
        </Link>
      </section>
    </main>
  );
}
