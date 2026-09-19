/** The Android app (android/ in this repo) injects window.RayApp into every
 * page of the site: a message channel to native code for what a WebView
 * can't do itself, like classic Bluetooth printers. Undefined in browsers. */
export type RayApp = {
  platform: "android";
  version?: string;
  call: <T = unknown>(method: string, args?: Record<string, unknown>) => Promise<T>;
  toBase64: (bytes: Uint8Array) => string;
};

export function nativeApp(): RayApp | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { RayApp?: RayApp }).RayApp ?? null;
}

export function isNativeApp(): boolean {
  return nativeApp() !== null;
}
