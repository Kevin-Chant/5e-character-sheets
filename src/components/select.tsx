import classNames from "classnames";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { FaChevronDown } from "react-icons/fa6";

// The app's one closed-list picker: a button that opens a filtered listbox.
// Filtering is the default; below `filterThreshold` the filter box is omitted
// and typing still jumps to a match. The popup is portalled to `<body>` and
// positioned fixed, since an absolutely positioned list would be clipped by
// whichever scrolling ancestor it renders inside (sheet scroll area, modals,
// the play board's roster).

export interface SelectOption {
  value: string;
  label: string;
  /** Optional heading this option sorts under; headings render in first-seen
      order, and only where they still separate something. */
  group?: string;
  /** Native tooltip, for options whose label can't carry the whole meaning. */
  title?: string;
  disabled?: boolean;
  /** Secondary line under the label: prose that explains the option — what a
      condition does, what a rest variant changes. */
  hint?: string;
  /** A short value shown right-aligned on the label's own line — a modifier, a
      slot count, a distance. Kept apart from `hint` because a number wants to
      sit in a column you can scan down, and a sentence wants a line. */
  meta?: string;
  /** Extra words the filter matches but nobody sees: the synonyms a player
      types and the label doesn't contain ("save" for a saving throw). */
  keywords?: string;
}

/** A plain string list is the common case; it means value === label. */
export type SelectOptions = readonly (SelectOption | string)[];

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOptions;
  /** What the trigger reads when nothing is chosen. */
  placeholder?: string;
  /** Accessible name. Required — every one of these is a control in a row of
      controls, and "combobox" alone never says which. */
  label: string;
  /** Fixed trigger text for pickers that hold no value and act on choice
      ("Hand to…", "+ condition"). Implies the value never shows. */
  triggerLabel?: string;
  /** Offers an explicit entry that clears the value back to "". */
  clearable?: boolean;
  clearLabel?: string;
  /** Option count at or above which the popup gets a filter box. */
  filterThreshold?: number;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  id?: string;
  title?: string;
  autoFocus?: boolean;
  /** Extra text under the filter box — what a filtered-out option would need
      you to know ("type to search all 319"). Rendered only when filtering. */
  filterHint?: string;
}

const DEFAULT_FILTER_THRESHOLD = 8;

function normalize(options: SelectOptions): SelectOption[] {
  return options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
}

// Every query word must appear somewhere in the label/group/hint/meta/keywords,
// in any order — so "dex save" finds "Dexterity" under "Saving throws".
function matches(option: SelectOption, words: string[]): boolean {
  if (!words.length) return true;
  const haystack = `${option.label} ${option.group ?? ""} ${
    option.hint ?? ""
  } ${option.meta ?? ""} ${option.keywords ?? ""}`.toLowerCase();
  return words.every((w) => haystack.includes(w));
}

export default function Select({
  value,
  onChange,
  options,
  placeholder,
  label,
  triggerLabel,
  clearable,
  clearLabel = "None",
  filterThreshold = DEFAULT_FILTER_THRESHOLD,
  className,
  triggerClassName,
  disabled,
  id,
  title,
  autoFocus,
  filterHint,
}: SelectProps) {
  const all = useMemo(() => normalize(options), [options]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const generatedId = useId();
  const listId = `${id ?? generatedId}-list`;

  const filtering = all.length >= filterThreshold;

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hits = all.filter((o) => matches(o, words));
    if (clearable && !words.length)
      return [{ value: "", label: clearLabel }, ...hits];
    return hits;
  }, [all, query, clearable, clearLabel]);

  const chosen = all.find((o) => o.value === value);
  const triggerText =
    triggerLabel ?? chosen?.label ?? (value === "" ? undefined : value);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openList = useCallback(() => {
    if (disabled) return;
    setQuery("");
    // Land the cursor on what's already chosen, so arrow keys start from the
    // current answer rather than from the top of the list.
    const at = all.findIndex((o) => o.value === value);
    setActive(clearable ? at + 1 : Math.max(at, 0));
    setOpen(true);
  }, [disabled, all, value, clearable]);

  const pick = (option: SelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    close();
  };

  // Keep the cursor inside the list as filtering shrinks it.
  useEffect(() => {
    if (active >= shown.length) setActive(Math.max(shown.length - 1, 0));
  }, [shown.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popupRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      // No refocus: the click already says where the user is going.
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  const move = (step: number) => {
    if (!shown.length) return;
    setActive((i) => {
      let next = i;
      // Skip disabled rows rather than stalling on them.
      for (let n = 0; n < shown.length; n++) {
        next = (next + step + shown.length) % shown.length;
        if (!shown[next].disabled) return next;
      }
      return i;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(shown.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Must not escape to a surrounding form (several of these sit in one).
      e.stopPropagation();
      if (shown[active]) pick(shown[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      close(false);
    } else if (!filtering && e.key.length === 1) {
      // Type-to-jump for the short lists that have no filter box.
      const hit = shown.findIndex((o) =>
        o.label.toLowerCase().startsWith(e.key.toLowerCase()),
      );
      if (hit >= 0) setActive(hit);
    }
  };

  return (
    <span className={classNames("app-select", className)}>
      <button
        type="button"
        ref={triggerRef}
        id={id}
        title={title}
        disabled={disabled}
        autoFocus={autoFocus}
        className={classNames("app-select-trigger", triggerClassName, {
          "is-placeholder": triggerText === undefined,
          "is-open": open,
        })}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (open) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            openList();
          }
        }}
      >
        <span className="app-select-value">{triggerText ?? placeholder}</span>
        {/* meta follows its option out of the list — it's part of the answer. */}
        {!triggerLabel && chosen?.meta && (
          <span className="app-select-trigger-meta">{chosen.meta}</span>
        )}
        <FaChevronDown className="app-select-caret" aria-hidden />
      </button>
      {open && (
        <SelectPopup
          anchor={triggerRef}
          popupRef={popupRef}
          listRef={listRef}
          listId={listId}
          label={label}
          filtering={filtering}
          filterHint={filterHint}
          query={query}
          setQuery={(next) => {
            setQuery(next);
            setActive(0);
          }}
          options={shown}
          active={active}
          setActive={setActive}
          value={value}
          onPick={pick}
          onKeyDown={onKeyDown}
        />
      )}
    </span>
  );
}

// The floating half. Split out so the anchoring effects mount and unmount with
// the popup rather than running on every closed select on the page.
function SelectPopup({
  anchor,
  popupRef,
  listRef,
  listId,
  label,
  filtering,
  filterHint,
  query,
  setQuery,
  options,
  active,
  setActive,
  value,
  onPick,
  onKeyDown,
}: {
  anchor: React.RefObject<HTMLButtonElement>;
  popupRef: React.RefObject<HTMLDivElement>;
  listRef: React.RefObject<HTMLUListElement>;
  listId: string;
  label: string;
  filtering: boolean;
  filterHint?: string;
  query: string;
  setQuery: (next: string) => void;
  options: SelectOption[];
  active: number;
  setActive: (i: number) => void;
  value: string;
  onPick: (option: SelectOption) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [box, setBox] = useState<React.CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });

  const place = useCallback(() => {
    const trigger = anchor.current;
    const popup = popupRef.current;
    if (!trigger || !popup) return;
    const rect = trigger.getBoundingClientRect();
    const height = popup.offsetHeight;
    const below = window.innerHeight - rect.bottom;
    // Flip above only when there's genuinely more room there.
    const flip = below < height + 8 && rect.top > below;
    const width = Math.max(rect.width, 200);
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - width - 8),
    );
    setBox({
      position: "fixed",
      left,
      width,
      maxHeight: Math.max(140, (flip ? rect.top : below) - 12),
      ...(flip
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, []);

  useLayoutEffect(place, []);

  // Focus is a no-op on a `visibility: hidden` element, and the popup starts
  // hidden until `place` has measured it — so this waits for the placed box
  // rather than running with the mount, where it silently did nothing and
  // left the keyboard on the trigger.
  const placed = box.visibility !== "hidden";
  useLayoutEffect(() => {
    if (!placed) return;
    inputRef.current?.focus();
    if (!filtering) listRef.current?.focus();
  }, [placed]);

  useEffect(() => {
    // Capture catches inner scrollers (sheet `#detail`, roster) as well as the window.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, []);

  // Re-place after the list re-renders shorter or taller under a filter.
  useLayoutEffect(place, [options.length]);

  // Keep the keyboard cursor in view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(".is-active");
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // Contiguous runs of a shared heading, so the flat index the keyboard walks
  // stays the index the options render at.
  const runs: { group?: string; from: number; options: SelectOption[] }[] = [];
  for (const [i, option] of options.entries()) {
    const last = runs[runs.length - 1];
    if (last && last.group === option.group) last.options.push(option);
    else runs.push({ group: option.group, from: i, options: [option] });
  }
  // Headings only survive where they still separate something.
  const grouped = runs.length > 1 && runs.every((r) => r.group);

  const renderOption = (option: SelectOption, i: number) => {
    // meta/hint are the accessible description, not part of the name — else
    // they'd join it into a paragraph where a screen reader wants a noun.
    const described = [
      option.meta ? `${listId}-${i}-meta` : "",
      option.hint ? `${listId}-${i}-hint` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <li key={`${option.value}-${i}`} role="presentation">
        <div
          id={`${listId}-${i}`}
          role="option"
          aria-label={option.label}
          aria-describedby={described || undefined}
          aria-selected={option.value === value}
          aria-disabled={option.disabled}
          title={option.title}
          className={classNames("app-select-option", {
            "is-active": i === active,
            "is-chosen": option.value === value,
            "is-disabled": option.disabled,
          })}
          // pointerdown, so the pick lands before the filter box's blur.
          onPointerDown={(e) => {
            e.preventDefault();
            onPick(option);
          }}
          onPointerEnter={() => !option.disabled && setActive(i)}
        >
          <span className="app-select-option-main">
            <span className="app-select-option-label">{option.label}</span>
            {option.meta && (
              <span
                className="app-select-option-meta"
                id={`${listId}-${i}-meta`}
              >
                {option.meta}
              </span>
            )}
          </span>
          {option.hint && (
            <span className="app-select-option-hint" id={`${listId}-${i}-hint`}>
              {option.hint}
            </span>
          )}
        </div>
      </li>
    );
  };

  return createPortal(
    <div
      className="app-select-popup rounded-border-box"
      ref={popupRef}
      style={box}
      onKeyDown={onKeyDown}
    >
      {filtering && (
        <div className="app-select-filter">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label={`Filter ${label.toLowerCase()}`}
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              options[active] ? `${listId}-${active}` : undefined
            }
            placeholder="Type to filter…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {filterHint && <span className="app-select-hint">{filterHint}</span>}
        </div>
      )}
      <ul
        className="app-select-list"
        id={listId}
        ref={listRef}
        role="listbox"
        aria-label={label}
        tabIndex={filtering ? undefined : -1}
        aria-activedescendant={
          !filtering && options[active] ? `${listId}-${active}` : undefined
        }
      >
        {options.length === 0 && (
          <li className="app-select-empty">No match for “{query}”</li>
        )}
        {grouped
          ? runs.map((run) => (
              // A real `group`, not a styled heading, so a screen reader can
              // say which side each name is on.
              <li key={run.group} role="group" aria-label={run.group}>
                <span className="app-select-group" aria-hidden>
                  {run.group}
                </span>
                <ul role="presentation">
                  {run.options.map((option, i) =>
                    renderOption(option, run.from + i),
                  )}
                </ul>
              </li>
            ))
          : options.map(renderOption)}
      </ul>
    </div>,
    document.body,
  );
}
