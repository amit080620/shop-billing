"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, User, Package, Receipt, LayoutGrid, ClipboardList, Compass, Loader2 } from "lucide-react";
import { universalSearchAction, type SearchResult } from "@/lib/actions/search";

const GROUP_ICON: Record<string, typeof User> = {
  Customers: User,
  Products: Package,
  Bills: Receipt,
  Tables: LayoutGrid,
  Orders: ClipboardList,
  Pages: Compass,
};

export function UniversalSearch({ ownsGlobalShortcut = true }: { ownsGlobalShortcut?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Global Ctrl+K / Cmd+K shortcut — focuses this same input directly,
  // rather than opening any separate box. Only one mounted instance
  // should own this (see ownsGlobalShortcut) since the mobile header
  // instance stays mounted (just CSS-hidden) at desktop widths — two
  // active listeners would double-toggle on a single keypress.
  useEffect(() => {
    if (!ownsGlobalShortcut) return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setShowPanel(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ownsGlobalShortcut]);

  // Click anywhere outside this component closes the results panel —
  // the input itself and its results always live in the same box, so
  // there's nothing else to manage.
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowPanel(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      const r = await universalSearchAction(query);
      setResults(r);
      setIsSearching(false);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function goTo(href: string) {
    setShowPanel(false);
    setQuery("");
    setResults([]);
    router.push(href);
  }

  function clear() {
    setQuery("");
    setResults([]);
    inputRef.current?.focus();
  }

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.group] ??= []).push(r);
    return acc;
  }, {});

  const showResultsPanel = showPanel && query.trim().length > 0;
  const isFocused = showPanel;

  return (
    <div ref={wrapperRef} className="relative w-full md:w-64">
      <div
        className="flex w-full items-center gap-2 rounded-full bg-background px-3.5 py-2 text-sm transition-shadow"
        style={{
          boxShadow: isFocused
            ? "inset 4px 4px 10px var(--neu-dark), inset -4px -4px 10px var(--neu-light), 0 0 0 2px var(--brand-soft)"
            : "inset 3px 3px 8px var(--neu-dark), inset -3px -3px 8px var(--neu-light)",
        }}
      >
        <Search size={14} className={`shrink-0 transition-colors ${isFocused ? "text-brand" : "text-muted"}`} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setShowPanel(true)}
          placeholder="Search…"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
        />
        {query ? (
          <button onClick={clear} aria-label="Clear search" className="shrink-0 rounded-full p-0.5 hover:bg-black/5">
            <X size={14} className="text-muted" />
          </button>
        ) : (
          <span className="hidden shrink-0 rounded-md border border-border/70 px-1.5 py-0.5 text-[10px] font-medium text-muted md:inline">
            Ctrl K
          </span>
        )}
      </div>

      {showResultsPanel && (
        <div
          className="ray-pop absolute left-0 right-0 top-full z-50 mt-2 max-h-[65vh] overflow-y-auto rounded-2xl bg-surface p-1.5"
          style={{ boxShadow: "var(--elevation-4)", border: "1px solid var(--border)" }}
        >
          {isSearching && (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted">
              <Loader2 size={15} className="animate-spin" />
              Searching…
            </div>
          )}

          {!isSearching && query.trim().length >= 2 && results.length === 0 && (
            <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
              <Search size={20} className="text-muted/50" />
              <p className="text-sm text-muted">No matches for &quot;{query}&quot;</p>
            </div>
          )}

          {!isSearching && query.trim().length < 2 && (
            <p className="px-4 py-8 text-center text-sm text-muted">Type at least 2 characters to search.</p>
          )}

          {Object.entries(grouped).map(([group, items], groupIndex) => {
            const GroupIcon = GROUP_ICON[group] ?? Compass;
            return (
              <div key={group} className={groupIndex > 0 ? "mt-1 border-t border-border/60 pt-1" : ""}>
                <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted/80">{group}</p>
                {items.map((r) => (
                  <button
                    key={`${r.group}-${r.id}`}
                    onClick={() => goTo(r.href)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-brand-soft"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-brand-text"
                      style={{ boxShadow: "-2px -2px 4px var(--neu-light), 2px 2px 4px var(--neu-dark)" }}
                    >
                      <GroupIcon size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{r.title}</span>
                      {r.subtitle && <span className="block truncate text-xs text-muted">{r.subtitle}</span>}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
