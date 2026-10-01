import { NextResponse } from "next/server";
import { APP_DOWNLOAD_URL } from "@/lib/nativeApp";

/** bill.theray.in/download — a short link to the newest Android app, to send
 * a shop on WhatsApp instead of the APK file itself. Always the latest build. */
export function GET() {
  return NextResponse.redirect(APP_DOWNLOAD_URL, 302);
}
