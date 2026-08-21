"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

export function MoreSearchBox() {
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Genuinely scoped to the More page's own content — walks up from
    // this search box to the shared page wrapper, so this never
    // touches anything outside the More screen itself.
    const root = containerRef.current?.closest("main") ?? document.body;
    const items = root.querySelectorAll<HTMLElement>("[data-menu-search-item]");
    const q = query.trim().toLowerCase();

    for (const item of items) {
      const text = item.dataset.menuSearchText ?? "";
      const matches = q === "" || text.includes(q);
      item.style.display = matches ? "" : "none";

      // A match sitting inside a collapsed <details> group would
      // otherwise stay genuinely invisible — force that group open
      // while there's an active, matching search.
      if (matches && q !== "") {
        const details = item.closest("details");
        if (details && !details.open) details.open = true;
      }
    }

    // Hide a group's own header entirely when a search is active and
    // none of its links matched — avoids a confusing empty section
    // heading with nothing visible underneath it.
    if (q !== "") {
      const groups = root.querySelectorAll<HTMLDetailsElement>("details");
      for (const group of groups) {
        const hasVisibleMatch = Array.from(group.querySelectorAll<HTMLElement>("[data-menu-search-item]")).some(
          (item) => item.style.display !== "none",
        );
        group.style.display = hasVisibleMatch ? "" : "none";
      }
    } else {
      const groups = root.querySelectorAll<HTMLDetailsElement>("details");
      for (const group of groups) group.style.display = "";
    }
  }, [query]);

  return (
    <div ref={containerRef} className="sticky top-0 z-10 -mx-4 bg-background px-4 pb-2 pt-1">
      <div className="flex items-center gap-2 rounded-full bg-surface px-3.5 py-2.5" style={{ boxShadow: "inset 2px 2px 5px var(--neu-dark), inset -2px -2px 5px var(--neu-light)" }}>
        <Search size={16} className="shrink-0 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search settings — e.g. products, loyalty, staff…"
          className="flex-1 bg-transparent text-sm outline-none"
        />
        {query && (
          <button onClick={() => setQuery("")} className="shrink-0 text-muted" aria-label="Clear search">
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
