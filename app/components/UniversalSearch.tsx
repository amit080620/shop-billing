"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { universalSearchAction, type SearchResult } from "@/lib/actions/search";

export function UniversalSearch({ ownsGlobalShortcut = true }: { ownsGlobalShortcut?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Global Ctrl+K / Cmd+K shortcut — works from anywhere in the dashboard,
  // not just when some specific field is focused. Only one mounted
  // instance should own this (see ownsGlobalShortcut) since the mobile
  // header instance stays mounted (just CSS-hidden) at desktop widths —
  // two active listeners would double-toggle on a single keypress.
  useEffect(() => {
    if (!ownsGlobalShortcut) return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ownsGlobalShortcut]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
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
    setOpen(false);
    router.push(href);
  }

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.group] ??= []).push(r);
    return acc;
  }, {});

  return (
    <>
      {/* The visible trigger — a search-looking button any page can show
          in its header; tapping it does the same thing as Ctrl+K. */}
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-sm text-muted shadow-sm md:w-64"
      >
        <Search size={14} />
        <span className="flex-1 text-left">Search…</span>
        <span className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted md:inline">Ctrl K</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[10vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="ray-pop flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-surface shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Search size={16} className="text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customers, products, bills…"
                className="flex-1 bg-transparent text-sm outline-none"
              />
              <button onClick={() => setOpen(false)} aria-label="Close search">
                <X size={16} className="text-muted" />
              </button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto">
              {isSearching && <p className="px-4 py-6 text-center text-sm text-muted">Searching…</p>}

              {!isSearching && query.trim().length >= 2 && results.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-muted">No matches for &quot;{query}&quot;</p>
              )}

              {!isSearching && query.trim().length < 2 && (
                <p className="px-4 py-6 text-center text-sm text-muted">Type at least 2 characters to search.</p>
              )}

              {Object.entries(grouped).map(([group, items]) => (
                <div key={group} className="py-1.5">
                  <p className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{group}</p>
                  {items.map((r) => (
                    <button
                      key={`${r.group}-${r.id}`}
                      onClick={() => goTo(r.href)}
                      className="flex w-full flex-col items-start gap-0 px-4 py-2 text-left hover:bg-brand-soft"
                    >
                      <span className="text-sm font-medium text-foreground">{r.title}</span>
                      {r.subtitle && <span className="text-xs text-muted">{r.subtitle}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
