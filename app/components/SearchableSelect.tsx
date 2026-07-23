"use client";

import { useMemo, useState } from "react";

export function SearchableSelect<T>({
  items,
  getLabel,
  getSubLabel,
  getKey,
  onSelect,
  placeholder,
}: {
  items: T[];
  getLabel: (item: T) => string;
  getSubLabel?: (item: T) => string;
  getKey: (item: T) => string;
  onSelect: (item: T) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return items.slice(0, 8);
    const q = query.toLowerCase();
    return items
      .filter(
        (i) =>
          getLabel(i).toLowerCase().includes(q) ||
          getSubLabel?.(i)?.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [items, query, getLabel, getSubLabel]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
          {filtered.map((item) => (
            <li key={getKey(item)}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(item);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm hover:bg-brand-soft"
              >
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {getLabel(item)}
                </span>
                {getSubLabel && (
                  <span className="shrink-0 text-xs text-muted">
                    {getSubLabel(item)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
