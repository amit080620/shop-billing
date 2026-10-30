/** Errors that ask the screen for the manager PIN start with this, so it can show the PIN box. */
export const PIN_NEEDED = "MANAGER_PIN:";

/** The message without its marker, or null when it isn't a PIN request. */
export function pinRequest(error: string | null | undefined): string | null {
  return error?.startsWith(PIN_NEEDED) ? error.slice(PIN_NEEDED.length) : null;
}
