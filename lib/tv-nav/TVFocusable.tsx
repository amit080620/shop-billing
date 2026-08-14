"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTVFocusManager } from "./TVNavigationProvider";
import { useTVFocusZone } from "./TVFocusZone";

export function TVFocusable({
  id: explicitId,
  onSelect,
  autoFocus,
  className,
  focusClassName = "tv-focused",
  /** Whether a mouse/touch click on this wrapper also triggers
   * onSelect. Defaults to true (the common case: this wraps a card
   * that IS meant to be clickable). Set to false when this wraps a
   * container that previously had no click handler of its own — e.g.
   * a card whose only interactive parts are specific buttons inside
   * it — so adopting TVFocusable doesn't introduce a new, surprising
   * "tap anywhere on this card" side effect that wasn't there before. */
  clickable = true,
  children,
}: {
  id?: string;
  onSelect: () => void;
  autoFocus?: boolean;
  className?: string;
  focusClassName?: string;
  clickable?: boolean;
  children: ReactNode;
}) {
  const autoId = useId();
  const id = explicitId ?? autoId;
  const manager = useTVFocusManager();
  const zoneId = useTVFocusZone();
  const ref = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    manager.register({
      id,
      zoneId,
      getRect: () => ref.current?.getBoundingClientRect() ?? null,
      onFocus: () => {
        setIsFocused(true);
        ref.current?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      },
      onBlur: () => setIsFocused(false),
      onSelect,
    });
    if (autoFocus && manager.getFocusedId() === null) {
      manager.focus(id);
    }
    return () => manager.unregister(id);
    // Re-registering on every onSelect change would thrash focus state;
    // the manager always calls the LATEST closure captured here since
    // this effect re-runs when onSelect itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, zoneId, onSelect]);

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={-1}
      onClick={clickable ? onSelect : undefined}
      className={`${className ?? ""} ${isFocused ? focusClassName : ""}`}
    >
      {children}
    </div>
  );
}
