/** The Android app (android/ in this repo) injects window.RayApp into every
 * page of the site: a message channel to native code for what a WebView
 * can't do itself, like classic Bluetooth printers. Undefined in browsers. */
export type RayApp = {
  platform: "android";
  version?: string;
  /** Present on app versions that ship native scanning (1.0.2+); older
   * installs have no `features`, so callers must treat it as optional. */
  features?: { barcode?: boolean };
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

/** The newest Android app build. When a new APK is released, upload it (see
 * android/README.md) and raise this: older installs then see a one-tap
 * "update the app" banner, and /download hands out the new file. */
export const LATEST_APP_VERSION = "1.0.3";
export const APP_DOWNLOAD_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/app/TheRay-v${LATEST_APP_VERSION}.apk`;

/** The installed app's version, from the "TheRayApp/1.0.2" every version
 * adds to its user agent (window.RayApp.version is missing on some). */
export function appVersion(): string | null {
  if (typeof navigator === "undefined") return null;
  return navigator.userAgent.match(/TheRayApp\/(\d+(?:\.\d+)*)/)?.[1] ?? null;
}

export function isOlderVersion(version: string, than: string): boolean {
  const a = version.split(".").map(Number);
  const b = than.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}
