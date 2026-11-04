"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import {
  AppShortcuts,
  type PurchaseLink,
  type ShortcutPage,
  useModifierLabel,
} from "./app-shortcuts";
import {
  CalendarMonthIcon,
  CloseIcon,
  DashboardIcon,
  HistoryIcon,
  LogoutIcon,
  MenuIcon,
  ReceiptLongIcon,
  SearchIcon,
  SettingsIcon,
  SidePanelIcon,
  SmartToyIcon,
  TaskAltIcon,
  TuneIcon,
} from "./icons";
import { LinkPending } from "./navigation-feedback";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  goKey: string;
  exact?: boolean;
  badge?: "approvals";
}

// Grouped by what people come to do, not by how the backend is built.
const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      {
        href: "/app",
        label: "Overview",
        icon: DashboardIcon,
        goKey: "o",
        exact: true,
      },
      { href: "/app/agent", label: "Agent", icon: SmartToyIcon, goKey: "a" },
    ],
  },
  {
    label: "Money",
    items: [
      {
        href: "/app/purchases",
        label: "Purchases",
        icon: ReceiptLongIcon,
        goKey: "p",
      },
      {
        href: "/app/approvals",
        label: "Approvals",
        icon: TaskAltIcon,
        goKey: "v",
        badge: "approvals",
      },
    ],
  },
  {
    label: "Planning",
    items: [
      { href: "/app/rules", label: "Rules", icon: TuneIcon, goKey: "r" },
      {
        href: "/app/calendar",
        label: "Calendar",
        icon: CalendarMonthIcon,
        goKey: "c",
      },
    ],
  },
  {
    label: "Records",
    items: [
      {
        href: "/app/activity",
        label: "Activity",
        icon: HistoryIcon,
        goKey: "l",
      },
    ],
  },
];

const SHORTCUT_PAGES: ShortcutPage[] = [
  ...NAV_GROUPS.flatMap((group) => group.items),
  { href: "/app/settings", label: "Settings", goKey: "s" },
].map(({ href, label, goKey }) => ({ href, label, goKey }));

// Read back in app/(dashboard)/layout.tsx.
const SIDEBAR_COOKIE = "finpal-sidebar";

export interface SidebarBudget {
  /** What's left to spend today, formatted; null with no daily budget. */
  left: string | null;
  cap: string | null;
  /** Share of today's budget still available, 0-100. */
  percentLeft: number;
}

function NavLink({
  item,
  count,
  pathname,
}: {
  item: NavItem;
  count: number;
  pathname: string;
}) {
  const active = item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="side-link"
      aria-current={active ? "page" : undefined}
      data-tip={item.label}
    >
      <Icon className="side-link__icon" />
      <span className="side-link__label">{item.label}</span>
      <LinkPending />
      {count ? (
        <span className="side-link__badge" aria-label={`${count} waiting`}>
          {count}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * The app's main navigation: a column that collapses to an icon rail on wide
 * screens, a drawer on small ones. "Left today" stays in view on every page,
 * because staying inside your limits is what the product is for.
 */
export function AppSidebar({
  brand,
  approvals,
  budget,
  email,
  canSignOut,
  initialCollapsed,
  purchases,
}: {
  brand: ReactNode;
  approvals: number;
  budget: SidebarBudget;
  email: string | null;
  canSignOut: boolean;
  /** From a cookie, so the first paint already has the right width. */
  initialCollapsed: boolean;
  /** Recent purchases the search palette can jump to. */
  purchases: PurchaseLink[];
}) {
  const pathname = usePathname();
  const mod = useModifierLabel();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [paletteRequest, setPaletteRequest] = useState(0);
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);
  const [lastPath, setLastPath] = useState(pathname);
  const asideRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  // Following a link closes the drawer.
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
    setTip(null);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open]);

  const toggleSidebar = useCallback(() => {
    // On small screens the same key opens and closes the drawer.
    if (matchMedia("(max-width: 960px)").matches) {
      setOpen((value) => !value);
      return;
    }
    setTip(null);
    document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? "open" : "collapsed"}; path=/; max-age=31536000; samesite=lax`;
    setCollapsed(!collapsed);
  }, [collapsed]);

  // One highlight that slides between links rather than one per link.
  useLayoutEffect(() => {
    const aside = asideRef.current;
    const pill = pillRef.current;
    if (!aside || !pill) return;
    const place = () => {
      const link = aside.querySelector<HTMLElement>(
        '.side-link[aria-current="page"]',
      );
      pill.style.opacity = link ? "1" : "0";
      if (link) pill.style.transform = `translateY(${link.offsetTop}px)`;
    };
    place();
    aside.dataset.pill = "ready";
    const observer = new ResizeObserver(place);
    observer.observe(aside);
    const foot = aside.querySelector(".side__foot");
    if (foot) observer.observe(foot);
    return () => observer.disconnect();
  }, [pathname, collapsed]);

  // The rail clips its overflow, so its labels are drawn from one fixed tip.
  function showTip(event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) {
    if (!collapsed) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-tip]",
    );
    if (!target) {
      setTip(null);
      return;
    }
    const box = target.getBoundingClientRect();
    setTip({
      label: target.dataset.tip ?? "",
      top: box.top + box.height / 2,
    });
  }

  const settingsActive = pathname.startsWith("/app/settings");

  return (
    <>
      <aside
        ref={asideRef}
        className="side"
        data-open={open || undefined}
        data-collapsed={collapsed || undefined}
        onMouseOver={showTip}
        onMouseLeave={() => setTip(null)}
        onFocus={showTip}
        onBlur={() => setTip(null)}
      >
        <span ref={pillRef} className="side-pill" aria-hidden />
        <div className="side__brand">
          {brand}
          <button
            type="button"
            className="side__toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            data-tip="Expand sidebar"
            onClick={toggleSidebar}
          >
            <SidePanelIcon />
          </button>
          <button
            type="button"
            className="icon-button side__close"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            <CloseIcon />
          </button>
        </div>

        <button
          type="button"
          className="side-link side-search"
          data-tip="Search"
          onClick={() => setPaletteRequest((n) => n + 1)}
        >
          <SearchIcon className="side-link__icon" />
          <span className="side-link__label">Search</span>
          <kbd className="kbd side-search__kbd">{mod} K</kbd>
        </button>

        <nav className="side__nav" aria-label="Main">
          {NAV_GROUPS.map((group) => (
            <div key={group.label ?? "main"} className="side__group">
              {group.label ? (
                <span className="side__label">{group.label}</span>
              ) : null}
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  count={item.badge ? approvals : 0}
                />
              ))}
            </div>
          ))}
        </nav>

        <div className="side__foot">
          <Link
            href="/app/rules"
            className="side-budget"
            aria-label={
              budget.left
                ? `${budget.left} left today of ${budget.cap}`
                : "Set a daily budget"
            }
            data-tip={
              budget.left ? `${budget.left} left today` : "Set a budget"
            }
          >
            <span className="side-budget__full">
              <span className="side__label">Left today</span>
              {budget.left ? (
                <>
                  <strong className="mono">{budget.left}</strong>
                  <span
                    className="side-budget__bar"
                    data-low={budget.percentLeft < 25 || undefined}
                  >
                    <i style={{ width: `${budget.percentLeft}%` }} />
                  </span>
                  <span className="small ink4">of {budget.cap} a day</span>
                </>
              ) : (
                <span className="small ink3">Set a daily budget</span>
              )}
            </span>
            {/* The rail keeps the meter as a slim vertical gauge. */}
            <span
              className="side-budget__gauge"
              data-low={budget.percentLeft < 25 || undefined}
              aria-hidden
            >
              <i style={{ height: `${budget.percentLeft}%` }} />
            </span>
          </Link>
          <Link
            href="/app/settings"
            className="side-link"
            aria-current={settingsActive ? "page" : undefined}
            data-tip="Settings"
          >
            <SettingsIcon className="side-link__icon" />
            <span className="side-link__label">Settings</span>
            <LinkPending />
          </Link>
          <div className="side-account">
            <span
              className="small ink3 side-account__email truncate"
              title={email ?? undefined}
            >
              {email ?? "Demo account"}
            </span>
            {canSignOut ? (
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="icon-button side-account__out"
                  aria-label="Sign out"
                  data-tip="Sign out"
                >
                  <LogoutIcon />
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </aside>
      {tip ? (
        <div className="side-tip" style={{ top: tip.top }} role="presentation">
          {tip.label}
        </div>
      ) : null}
      <div className="side-mobilebar">
        <button
          type="button"
          className="icon-button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <MenuIcon />
        </button>
        {brand}
      </div>
      {open ? (
        <button
          type="button"
          className="side-scrim"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <AppShortcuts
        pages={SHORTCUT_PAGES}
        purchases={purchases}
        paletteRequest={paletteRequest}
        onToggleSidebar={toggleSidebar}
      />
    </>
  );
}
