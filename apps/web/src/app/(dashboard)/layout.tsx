import { LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { requireUser } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="bg-sidebar flex flex-col gap-6 border-b p-4 md:w-60 md:border-r md:border-b-0">
        <Link
          href="/dashboard"
          className="px-3 text-lg font-semibold tracking-tight"
        >
          FinPal
        </Link>
        <AppNav />
        <div className="mt-auto grid gap-2 px-3">
          <p className="text-muted-foreground truncate text-xs">{user.email}</p>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm" className="w-full">
              <LogOut aria-hidden />
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <p className="border-b bg-amber-50 px-6 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          PayPal Sandbox mode — simulated funds only.
        </p>
        <div className="flex-1 p-6">{children}</div>
      </div>
    </div>
  );
}
