export type Direction = "up" | "down" | "left" | "right";

type Registered = {
  id: string;
  zoneId: string;
  getRect: () => DOMRect | null;
  onFocus: () => void;
  onBlur: () => void;
  onSelect: () => void;
};

/** Pure spatial-navigation logic — given a direction and the current
 * focused element's position, finds the geometrically "best" candidate
 * among all registered elements. This is real screen-position math,
 * not DOM tab-order, per the requirement that arrow keys must feel
 * spatially natural (like Netflix/YouTube TV) rather than jumping
 * around in markup order. No React here on purpose — a manager class
 * is easy to unit-test and easy to reason about independent of any
 * component tree. */
export class TVFocusManager {
  private elements = new Map<string, Registered>();
  private focusedId: string | null = null;
  private memory = new Map<string, string>(); // scopeKey -> last focused id

  register(entry: Registered) {
    this.elements.set(entry.id, entry);
  }

  unregister(id: string) {
    this.elements.delete(id);
    if (this.focusedId === id) this.focusedId = null;
  }

  getFocusedId() {
    return this.focusedId;
  }

  /** Focuses a specific id directly — used for initial-focus-on-mount
   * and for restoring remembered focus. */
  focus(id: string) {
    if (!this.elements.has(id)) return;
    if (this.focusedId && this.focusedId !== id) {
      this.elements.get(this.focusedId)?.onBlur();
    }
    this.focusedId = id;
    this.elements.get(id)?.onFocus();
  }

  select() {
    if (!this.focusedId) return;
    this.elements.get(this.focusedId)?.onSelect();
  }

  /** Remembers the currently-focused id under a scope key (e.g. a
   * route path or a modal's id) — used so that closing a modal or
   * navigating back restores exactly where the person left off. */
  remember(scopeKey: string) {
    if (this.focusedId) this.memory.set(scopeKey, this.focusedId);
  }

  /** Restores a remembered id if it's still registered (survives a
   * modal remount, list re-render, etc.); falls back to focusing the
   * first available element within an optional zone, and does nothing
   * if there's genuinely nothing focusable yet. */
  restore(scopeKey: string, fallbackZoneId?: string) {
    const remembered = this.memory.get(scopeKey);
    if (remembered && this.elements.has(remembered)) {
      this.focus(remembered);
      return;
    }
    this.focusFirstInZone(fallbackZoneId);
  }

  focusFirstInZone(zoneId?: string) {
    for (const entry of this.elements.values()) {
      if (!zoneId || entry.zoneId === zoneId) {
        this.focus(entry.id);
        return;
      }
    }
  }

  /** The actual spatial search: among all OTHER registered elements,
   * find the one that is positioned in the given direction from the
   * current element and is the closest/most-aligned match. */
  move(direction: Direction) {
    const current = this.focusedId ? this.elements.get(this.focusedId) : null;
    const currentRect = current?.getRect();
    if (!current || !currentRect) {
      this.focusFirstInZone();
      return;
    }

    let best: { id: string; score: number } | null = null;

    for (const [id, entry] of this.elements) {
      if (id === current.id) continue;
      const rect = entry.getRect();
      if (!rect) continue;

      if (!this.isRoughlyInDirection(currentRect, rect, direction)) continue;

      const score = this.distanceScore(currentRect, rect, direction);
      if (best === null || score < best.score) best = { id, score };
    }

    if (best) this.focus(best.id);
  }

  private isRoughlyInDirection(from: DOMRect, to: DOMRect, direction: Direction): boolean {
    // A small overlap tolerance keeps slightly-offset grid rows/columns
    // navigable (real card grids are rarely pixel-perfectly aligned).
    switch (direction) {
      case "right":
        return to.left >= from.left + from.width * 0.5;
      case "left":
        return to.right <= from.right - from.width * 0.5;
      case "down":
        return to.top >= from.top + from.height * 0.5;
      case "up":
        return to.bottom <= from.bottom - from.height * 0.5;
    }
  }

  /** Lower is better. Primary axis distance dominates; a perpendicular
   * misalignment penalty breaks ties toward the geometrically closest,
   * best-aligned neighbour — the same intuition as "nearest neighbour
   * in the direction you pressed", which is what OTT remote nav feels
   * like when done well. */
  private distanceScore(from: DOMRect, to: DOMRect, direction: Direction): number {
    const fromCenterX = from.left + from.width / 2;
    const fromCenterY = from.top + from.height / 2;
    const toCenterX = to.left + to.width / 2;
    const toCenterY = to.top + to.height / 2;

    if (direction === "left" || direction === "right") {
      const primary = Math.abs(toCenterX - fromCenterX);
      const perpendicular = Math.abs(toCenterY - fromCenterY);
      return primary + perpendicular * 2;
    }
    const primary = Math.abs(toCenterY - fromCenterY);
    const perpendicular = Math.abs(toCenterX - fromCenterX);
    return primary + perpendicular * 2;
  }
}
