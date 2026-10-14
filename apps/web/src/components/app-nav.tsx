"use client";

import {
  CalendarDays,
  CheckCircle2,
  LayoutDashboard,
  PlusCircle,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/proposals/new", label: "New proposal", icon: PlusCircle },
  { href: "/approvals", label: "Approvals", icon: CheckCircle2 },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="grid gap-1">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
