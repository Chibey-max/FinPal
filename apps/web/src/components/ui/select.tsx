"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { CheckIcon, ExpandMoreIcon, SearchIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export type SelectOption = string | { value: string; label: string };

const normalize = (option: SelectOption) =>
  typeof option === "string" ? { value: option, label: option } : option;

/** Above this many options the list gets a filter box (e.g. timezones). */
const FILTER_THRESHOLD = 12;

/**
 * Styled replacement for <select>: a button plus an ARIA listbox. Keyboard:
 * arrows / Home / End move, Enter or Space picks, Escape closes, typing
 * jumps to a matching option (or filters long lists). Opens upward when
 * there is no room below.
 */
export function Select({
  value,
  onChange,
  options,
  className,
  disabled,
  "aria-label": ariaLabel,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  /** Applied to the trigger, so it can share the form's input styles. */
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
  /** Error state: red border (aria-invalid is not valid on a button). */
  invalid?: boolean;
}) {
  const id = useId();
  const items = useMemo(() => options.map(normalize), [options]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<"down" | "up">("down");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const typeahead = useRef({ text: "", at: 0 });

  const filterable = items.length > FILTER_THRESHOLD;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
  }, [items, query]);
  const selected = items.find((item) => item.value === value);

  function openList() {
    if (disabled) return;
    const box = triggerRef.current?.getBoundingClientRect();
    const below = box ? innerHeight - box.bottom : 400;
    setPlacement(below < 300 && (box?.top ?? 0) > below ? "up" : "down");
    setQuery("");
    setActive(
      Math.max(
        0,
        items.findIndex((item) => item.value === value),
      ),
    );
    setOpen(true);
  }

  function close(focusTrigger = true) {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }

  function pick(index: number) {
    const item = visible[index];
    if (!item) return;
    onChange(item.value);
    close();
  }

  // Close on outside pointer.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    addEventListener("pointerdown", onPointer);
    return () => removeEventListener("pointerdown", onPointer);
  }, [open]);

  // Focus the filter (long lists) or the list, and keep the active option in view.
  useEffect(() => {
    if (!open) return;
    (filterable ? filterRef.current : listRef.current)?.focus();
  }, [open, filterable]);
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active, visible]);

  function onListKey(event: KeyboardEvent) {
    const last = visible.length - 1;
    const move = (to: number) => {
      event.preventDefault();
      setActive(Math.max(0, Math.min(last, to)));
    };
    switch (event.key) {
      case "ArrowDown":
        return move(active + 1);
      case "ArrowUp":
        return move(active - 1);
      case "Home":
        return move(0);
      case "End":
        return move(last);
      case "PageDown":
        return move(active + 8);
      case "PageUp":
        return move(active - 8);
      case "Enter":
        event.preventDefault();
        return pick(active);
      case " ":
        if (filterable) return;
        event.preventDefault();
        return pick(active);
      case "Escape":
        event.preventDefault();
        return close();
      case "Tab":
        return close(false);
    }
    // Typeahead for short lists: jump to the first option starting with the typed text.
    if (!filterable && event.key.length === 1) {
      const now = Date.now();
      const state = typeahead.current;
      state.text = now - state.at > 700 ? event.key : state.text + event.key;
      state.at = now;
      const hit = visible.findIndex((item) =>
        item.label.toLowerCase().startsWith(state.text.toLowerCase()),
      );
      if (hit >= 0) setActive(hit);
    }
  }

  function onTriggerKey(event: KeyboardEvent) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openList();
    }
  }

  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-opt-${index}`;

  return (
    <div className="select" ref={rootRef} data-open={open || undefined}>
      <button
        ref={triggerRef}
        type="button"
        className={cn("select__trigger", className)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        data-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKey}
      >
        <span className="select__value">{selected?.label ?? value}</span>
        <ExpandMoreIcon className="select__chevron" />
      </button>

      {open ? (
        <div
          className="select__popover"
          data-placement={placement}
          data-lenis-prevent
          // Fields wrap controls in <label>; without this a click on an
          // option would re-activate the trigger and reopen the list.
          onClick={(event) => event.preventDefault()}
        >
          {filterable ? (
            <label className="select__filter">
              <SearchIcon aria-hidden />
              <input
                ref={filterRef}
                value={query}
                placeholder="Search…"
                aria-label="Filter options"
                aria-controls={listId}
                aria-activedescendant={
                  visible[active] ? optionId(active) : undefined
                }
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onListKey}
              />
            </label>
          ) : null}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            className="select__list"
            aria-activedescendant={
              visible[active] ? optionId(active) : undefined
            }
            onKeyDown={onListKey}
          >
            {visible.map((item, index) => (
              <li
                key={item.value}
                id={optionId(index)}
                role="option"
                data-index={index}
                aria-selected={item.value === value}
                data-active={index === active || undefined}
                onPointerMove={() => setActive(index)}
                onClick={() => pick(index)}
              >
                <span>{item.label}</span>
                {item.value === value ? <CheckIcon aria-hidden /> : null}
              </li>
            ))}
            {visible.length === 0 ? (
              <li className="select__empty" role="presentation">
                No matches
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
