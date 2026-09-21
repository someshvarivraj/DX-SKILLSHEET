'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

export type SelectOption = {
  value: string;
  label: string;
  /** Second line, for the context that makes two similar options distinct. */
  hint?: string;
  disabled?: boolean;
  /** Options sharing a group are shown together under its heading. */
  group?: string;
};

/**
 * A select built as a listbox rather than the browser's native control.
 *
 * The native control cannot show a second line per option, cannot be searched
 * in a long list, and is drawn by the operating system, so it ignores the rest
 * of the design. This keeps the parts that matter — full keyboard operation and
 * the ARIA roles a screen reader expects — and adds what the screens here need:
 * a hint line under each label, optional grouping, and type-ahead filtering once
 * the list is long enough to need it.
 *
 * Deliberately dependency-free. A component this size does not justify pulling
 * in a UI library, and the behaviour below is the documented listbox pattern,
 * not an invention.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = '選択してください',
  disabled = false,
  id,
  ariaLabel,
  /** Show the filter box from this many options onwards. */
  searchFrom = 8,
  className = '',
}: {
  value: string | null;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  searchFrom?: number;
  className?: string;
}) {
  const generatedId = useId();
  const listboxId = `${id ?? generatedId}-listbox`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;
  const searchable = options.length >= searchFrom;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint ?? '').toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  const close = useCallback(
    (returnFocus = true) => {
      setOpen(false);
      setQuery('');
      if (returnFocus) buttonRef.current?.focus();
    },
    [],
  );

  // Opening lands on the current selection, not on the first row, so arrow keys
  // move from where the operator actually is.
  useEffect(() => {
    if (!open) return;
    const index = visible.findIndex((o) => o.value === value);
    setActiveIndex(index >= 0 ? index : 0);
    if (searchable) searchRef.current?.focus();
    else listRef.current?.focus();
    // Only when the menu opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const commit = (option: SelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    close();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((i) => Math.min(visible.length - 1, i + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(visible.length - 1);
        break;
      case 'Enter':
      case 'Tab': {
        const option = visible[activeIndex];
        if (option) {
          event.preventDefault();
          commit(option);
        }
        break;
      }
      default:
        break;
    }
  };

  // Group headings are drawn in list order; an ungrouped list renders flat.
  let lastGroup: string | undefined;

  return (
    <div ref={rootRef} className={`select-root ${className}`} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className="select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={selected ? 'select-value' : 'select-placeholder'}>
          {selected ? selected.label : placeholder}
          {selected?.hint ? <span className="select-hint">{selected.hint}</span> : null}
        </span>
        <span className="select-caret" aria-hidden>
          <svg viewBox="0 0 12 12" width="12" height="12">
            <path
              d="M2.5 4.5 6 8l3.5-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open ? (
        <div className="select-menu">
          {searchable ? (
            <div className="select-search">
              <input
                ref={searchRef}
                className="input"
                type="text"
                value={query}
                placeholder="絞り込む"
                aria-label="選択肢を絞り込む"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
              />
            </div>
          ) : null}

          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={
              visible[activeIndex] ? `${listboxId}-${visible[activeIndex].value}` : undefined
            }
            className="select-list"
          >
            {visible.length === 0 ? (
              <li className="select-empty">該当する選択肢がない</li>
            ) : (
              visible.map((option, index) => {
                const heading = option.group && option.group !== lastGroup ? option.group : null;
                lastGroup = option.group;
                return (
                  <li key={option.value}>
                    {heading ? <p className="select-group">{heading}</p> : null}
                    <div
                      id={`${listboxId}-${option.value}`}
                      role="option"
                      aria-selected={option.value === value}
                      aria-disabled={option.disabled || undefined}
                      data-active={index === activeIndex}
                      className="select-option"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => commit(option)}
                    >
                      <span className="select-option-label">
                        {option.label}
                        {option.hint ? (
                          <span className="select-option-hint">{option.hint}</span>
                        ) : null}
                      </span>
                      {option.value === value ? (
                        <span className="select-check" aria-hidden>
                          <svg viewBox="0 0 12 12" width="12" height="12">
                            <path
                              d="M2.5 6.3 4.8 8.6 9.5 3.9"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
