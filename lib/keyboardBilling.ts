/** Keyboard billing on a computer: make and print a bill without the mouse, the way counter
 * software like Marg works. Enter on an empty item search opens the bill's last screen, Enter there
 * saves it (and "Print as soon as a bill is saved" prints it); F10 or Ctrl+Enter saves at once; Esc
 * goes back. On the printed bill Enter prints, P prints again and N (or Esc) starts the next bill.
 *
 * Turned on per computer (this browser) and off until then, so phones and shops that never asked for
 * it see no change. */

export const KEYBOARD_BILLING_KEY = "ray-keyboard-billing";
const LAST_SCREEN_KEY = "ray-last-billing-screen";
const BILLING_SCREENS = ["/bills/new", "/fast-billing"];

/** A bill's last screen ignores Enter this long after it opens, so a double press can't save a bill
 * nobody has looked at. */
export const SETTLE_MS = 500;

export function keyboardBillingOn(): boolean {
  try {
    return localStorage.getItem(KEYBOARD_BILLING_KEY) === "1";
  } catch {
    return false;
  }
}

export function setKeyboardBilling(on: boolean) {
  try {
    if (on) localStorage.setItem(KEYBOARD_BILLING_KEY, "1");
    else localStorage.removeItem(KEYBOARD_BILLING_KEY);
  } catch {
    // Private window: stays off.
  }
}

/** The billing screen this tab bills from, so N on a printed bill goes back to it. */
export function rememberBillingScreen(path: string) {
  if (!BILLING_SCREENS.includes(path)) return;
  try {
    sessionStorage.setItem(LAST_SCREEN_KEY, path);
  } catch {}
}

export function lastBillingScreen(): string | null {
  try {
    const path = sessionStorage.getItem(LAST_SCREEN_KEY);
    return path && BILLING_SCREENS.includes(path) ? path : null;
  } catch {
    return null;
  }
}

/** Where the keyboard is: nowhere in particular ("page"), the bill's item search, a field being
 * typed in, or a button/link (where Enter presses it, as always). */
export type FocusKind = "page" | "search" | "field" | "control";
export type BillingKey = "next" | "save" | "back" | "other" | "ignore";

type KeyInfo = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; repeat: boolean; isComposing?: boolean };

/** What a key press asks of a billing screen. A scanner's Enter always follows its digits in the
 * search box, so it never reads as "next": only Enter with the search box empty (or nothing focused)
 * does. A held key repeats nothing. */
export function readBillingKey(k: KeyInfo, focus: FocusKind, searchEmpty: boolean): BillingKey {
  if (k.repeat || k.isComposing) return "ignore";
  if (k.key === "F10" || (k.key === "Enter" && (k.ctrlKey || k.metaKey) && !k.altKey)) return focus === "control" ? "ignore" : "save";
  if (k.ctrlKey || k.metaKey || k.altKey) return "ignore";
  if (k.key === "Escape") return focus === "page" || focus === "search" ? "back" : "ignore";
  if (k.key === "Enter") return !k.shiftKey && (focus === "page" || (focus === "search" && searchEmpty)) ? "next" : "ignore";
  return "other";
}

export function focusKind(el: Element | null): FocusKind {
  if (!el || el === document.body || el === document.documentElement) return "page";
  if (el instanceof HTMLInputElement && el.dataset.billSearch !== undefined) return "search";
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable) return "field";
  return "control";
}

/** A popup or sheet over the screen (they all cover it with `fixed inset-0`), other than one marked
 * as part of billing itself: keys are left to it. */
export function overlayOpen(): boolean {
  return !!document.querySelector(".fixed.inset-0:not([data-keyboard-billing])");
}

/** The first shown, enabled element matching `selector`. */
function shown(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    if (el.offsetParent !== null && !(el as HTMLButtonElement).disabled) return el;
  }
  return null;
}

/** Presses a screen's button the way a mouse would: the field being typed in lets go first (so a
 * quantity typed but not yet confirmed counts), then the button is clicked once the screen has caught
 * up. Waits up to about half a second for the button to appear (the next screen opening). */
export function pressWhenReady(selector: string, frames = 30): Promise<boolean> {
  const active = document.activeElement;
  if (active instanceof HTMLElement && focusKind(active) === "field") active.blur();
  return new Promise((resolve) => {
    let left = frames;
    const tick = () => {
      const el = shown(selector);
      if (el) {
        el.click();
        resolve(true);
      } else if (--left > 0) requestAnimationFrame(tick);
      else resolve(false);
    };
    // Two frames: React re-renders after the blur before the button is looked for.
    requestAnimationFrame(() => requestAnimationFrame(tick));
  });
}

/** A key's way to press the screen's save button, once per bill: another press while the first is on
 * its way, or just after it went, does nothing — the bill is already being sent. */
export function savePresser(): () => void {
  let busy = false;
  let at = 0;
  return () => {
    if (busy || Date.now() - at < 2000) return;
    busy = true;
    void pressWhenReady("[data-keyboard-save]").then((clicked) => {
      busy = false;
      if (clicked) at = Date.now();
    });
  };
}

// The bill (by its page) already printed or about to print by itself — so Enter on it doesn't print
// it a second time. Kept by page path: the app moves between bills without reloading.
let printedPath: string | null = null;
/** This bill printed, or "Print as soon as a bill is saved" is about to print it. */
export function notePrinted() {
  printedPath = location.pathname;
}
export function printedAlready(): boolean {
  return printedPath === location.pathname;
}
