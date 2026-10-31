"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

import { SearchIcon } from "./icons";

export interface ShortcutPage {
  href: string;
  label: string;
  /** Second key of the "G then …" sequence. */
  goKey: string;
}

export interface PurchaseLink {
  id: string;
  name: string;
}

/** Fired by anything that wants the shortcut list open, e.g. Settings. */
export const OPEN_SHORTCUTS_EVENT = "finpal:shortcuts";

const noSubscribe = () => () => undefined;

export function useModifierLabel() {
  return useSyncExternalStore(
    noSubscribe,
    () => (/mac|iphone|ipad/i.test(navigator.userAgent) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

function useDialog(open: boolean): RefObject<HTMLDialogElement | null> {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return ref;
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="kbd-group">
      {keys.map((key) => (
        <kbd key={key} className="kbd">
          {key}
        </kbd>
      ))}
    </span>
  );
}

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  keys?: string[];
  run: () => void;
}

function CommandPalette({
  items,
  onClose,
}: {
  items: PaletteItem[];
  onClose: () => void;
}) {
  const ref = useDialog(true);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = items.filter((item) => {
    // Past purchases only appear once you start searching.
    if (item.group === "Purchases" && !words.length) return false;
    const text = item.label.toLowerCase();
    return words.every((word) => text.includes(word));
  });
  const current = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [current, query]);

  function run(item: PaletteItem | undefined) {
    if (!item) return;
    onClose();
    item.run();
  }

  function onKeyDown(event: ReactKeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      if (results.length) {
        setActive((current + step + results.length) % results.length);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(results[current]);
    }
  }

  return (
    <dialog
      ref={ref}
      className="palette"
      aria-label="Search FinPal"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="palette__box">
        <label className="palette__search">
          <SearchIcon aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={
              results[current] ? `palette-${results[current].id}` : undefined
            }
            aria-label="Search pages, actions and purchases"
            placeholder="Search pages, actions and purchases…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          <kbd className="kbd">Esc</kbd>
        </label>
        <div
          id="palette-results"
          ref={listRef}
          className="palette__list"
          role="listbox"
          aria-label="Results"
        >
          {results.map((item, index) => (
            <div key={item.id}>
              {item.group !== results[index - 1]?.group ? (
                <div className="palette__group" role="presentation">
                  {item.group}
                </div>
              ) : null}
              <div
                id={`palette-${item.id}`}
                role="option"
                aria-selected={index === current}
                className="palette__item"
                onMouseMove={() => setActive(index)}
                onClick={() => run(item)}
              >
                <span className="truncate">{item.label}</span>
                {item.keys ? <Keys keys={item.keys} /> : null}
              </div>
            </div>
          ))}
          {results.length ? null : (
            <p className="palette__empty">Nothing matches “{query.trim()}”.</p>
          )}
        </div>
      </div>
    </dialog>
  );
}

function ShortcutHelp({
  groups,
  onClose,
}: {
  groups: { title: string; rows: { label: string; keys: string[] }[] }[];
  onClose: () => void;
}) {
  const ref = useDialog(true);
  return (
    <dialog
      ref={ref}
      className="palette"
      aria-labelledby="shortcuts-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="palette__box shortcut-help">
        <div className="shortcut-help__head">
          <h2 id="shortcuts-title">Keyboard shortcuts</h2>
          <kbd className="kbd">Esc</kbd>
        </div>
        <div className="shortcut-help__body">
          {groups.map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              {group.rows.map((row) => (
                <div key={row.label} className="shortcut-help__row">
                  <span>{row.label}</span>
                  <Keys keys={row.keys} />
                </div>
              ))}
            </section>
          ))}
        </div>
        <p className="shortcut-help__note">
          Approving and paying always take a click, so a stray key can never
          spend money.
        </p>
      </div>
    </dialog>
  );
}

/**
 * The app's keyboard layer: a search palette, a shortcut list and single-key
 * navigation. Single keys are ignored while typing or with a dialog open.
 */
export function AppShortcuts({
  pages,
  purchases,
  paletteRequest,
  onToggleSidebar,
}: {
  pages: ShortcutPage[];
  purchases: PurchaseLink[];
  /** Goes up each time the sidebar's search button is pressed. */
  paletteRequest: number;
  onToggleSidebar: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const mod = useModifierLabel();
  const [dialog, setDialog] = useState<"palette" | "help" | null>(null);
  const [lastRequest, setLastRequest] = useState(paletteRequest);
  const [goPending, setGoPending] = useState(false);

  if (lastRequest !== paletteRequest) {
    setLastRequest(paletteRequest);
    setDialog("palette");
  }

  const toggleTheme = useCallback(() => {
    // Goes through the visible button, which owns the reveal animation.
    document.querySelector<HTMLButtonElement>(".theme-button")?.click();
  }, []);

  const focusPageInput = useCallback(() => {
    document
      .querySelector<HTMLElement>(
        '.agent-ask__input, .app-content input[type="search"]',
      )
      ?.focus();
  }, []);

  const newList = useCallback(() => {
    if (pathname === "/app/agent") focusPageInput();
    else {
      router.push("/app/agent");
      // This component outlives the navigation, so it waits for the new page.
      let tries = 0;
      const timer = setInterval(() => {
        const box = document.querySelector<HTMLElement>(".agent-ask__input");
        box?.focus();
        if (box || ++tries === 30) clearInterval(timer);
      }, 100);
    }
  }, [focusPageInput, pathname, router]);

  useEffect(() => {
    const open = () => setDialog("help");
    addEventListener(OPEN_SHORTCUTS_EVENT, open);
    return () => removeEventListener(OPEN_SHORTCUTS_EVENT, open);
  }, []);

  useEffect(() => {
    if (!goPending) return;
    const timer = setTimeout(() => setGoPending(false), 1200);
    return () => clearTimeout(timer);
  }, [goPending]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        if (event.altKey || event.shiftKey) return;
        const key = event.key.toLowerCase();
        if (key === "k") {
          event.preventDefault();
          setDialog((d) => (d === "palette" ? null : "palette"));
        } else if (key === "/") {
          event.preventDefault();
          setDialog((d) => (d === "help" ? null : "help"));
        } else if (key === "b") {
          event.preventDefault();
          onToggleSidebar();
        }
        return;
      }
      if (
        event.altKey ||
        event.defaultPrevented ||
        isTyping(event.target) ||
        document.querySelector("dialog[open]")
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (goPending) {
        setGoPending(false);
        const page = pages.find((p) => p.goKey === key);
        if (page) {
          event.preventDefault();
          router.push(page.href);
        }
        return;
      }
      if (event.key === "?") {
        setDialog("help");
      } else if (event.shiftKey) {
        return;
      } else if (key === "g") {
        setGoPending(true);
      } else if (key === "n") {
        event.preventDefault();
        newList();
      } else if (key === "t") {
        toggleTheme();
      } else if (key === "/") {
        event.preventDefault();
        focusPageInput();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [
    focusPageInput,
    goPending,
    newList,
    onToggleSidebar,
    pages,
    router,
    toggleTheme,
  ]);

  const items = useMemo<PaletteItem[]>(
    () => [
      ...pages.map((page) => ({
        id: `page-${page.goKey}`,
        group: "Go to",
        label: page.label,
        keys: ["G", page.goKey.toUpperCase()],
        run: () => router.push(page.href),
      })),
      {
        id: "new-list",
        group: "Actions",
        label: "New shopping list",
        keys: ["N"],
        run: newList,
      },
      {
        id: "add-item",
        group: "Actions",
        label: "Add one item by hand",
        run: () => router.push("/app/proposals/new"),
      },
      {
        id: "sidebar",
        group: "Actions",
        label: "Collapse or expand sidebar",
        keys: [mod, "B"],
        run: onToggleSidebar,
      },
      {
        id: "theme",
        group: "Actions",
        label: "Switch light or dark theme",
        keys: ["T"],
        run: toggleTheme,
      },
      {
        id: "help",
        group: "Actions",
        label: "Keyboard shortcuts",
        keys: ["?"],
        run: () => setDialog("help"),
      },
      ...purchases.map((purchase) => ({
        id: `purchase-${purchase.id}`,
        group: "Purchases",
        label: purchase.name,
        run: () => router.push(`/app/purchases/${purchase.id}`),
      })),
    ],
    [mod, newList, onToggleSidebar, pages, purchases, router, toggleTheme],
  );

  const helpGroups = useMemo(
    () => [
      {
        title: "General",
        rows: [
          { label: "Search everything", keys: [mod, "K"] },
          { label: "Collapse or expand sidebar", keys: [mod, "B"] },
          { label: "Show this list", keys: ["?"] },
          { label: "Switch theme", keys: ["T"] },
        ],
      },
      {
        title: "On this page",
        rows: [
          { label: "New shopping list", keys: ["N"] },
          { label: "Jump to the search or list box", keys: ["/"] },
        ],
      },
      {
        title: "Go to",
        rows: pages.map((page) => ({
          label: page.label,
          keys: ["G", page.goKey.toUpperCase()],
        })),
      },
    ],
    [mod, pages],
  );

  return (
    <>
      {dialog === "palette" ? (
        <CommandPalette items={items} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "help" ? (
        <ShortcutHelp groups={helpGroups} onClose={() => setDialog(null)} />
      ) : null}
      {goPending ? (
        <div className="go-hint" role="status">
          <kbd className="kbd">G</kbd> then a page key…
        </div>
      ) : null}
    </>
  );
}
