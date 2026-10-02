import { NextResponse, type NextRequest } from "next/server";

/** Routes a kitchen_only account should never leave — everything else
 * under the dashboard bounces back here, even via direct URL/bookmark,
 * not just at the moment of login. */
const KITCHEN_ALLOWED = ["/restaurant-kds", "/login", "/api"];

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "";

// Every screen homePathFor (lib/businessType) can send a shop to; the remembered home must be one.
const HOME_SCREENS = new Set(["/restaurant", "/hotel", "/clinic/prescriptions/new", "/gym/members/new", "/lab/orders/new", "/fast-billing", "/bills/new"]);

export function middleware(request: NextRequest) {
  const response = route(request);
  // Server action replies carry the deploy id, so a page still running older
  // code doesn't try to show a screen built by newer code (lib/actionGuard).
  if (BUILD && request.headers.has("next-action")) response.headers.set("x-ray-build", BUILD);
  return response;
}

function route(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only guard actual dashboard pages — skip static assets, the public
  // catalog/booking links, print views, etc.
  const isDashboardish =
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/print") &&
    !pathname.startsWith("/shop/") &&
    !pathname.startsWith("/order/") &&
    !pathname.startsWith("/book/") &&
    !pathname.startsWith("/gym-checkin/") &&
    !pathname.match(/\.(png|jpg|jpeg|svg|ico|webmanifest|json)$/);

  if (!isDashboardish) return NextResponse.next();

  const kitchenOnly = request.cookies.get("kitchen_only")?.value === "1";
  if (kitchenOnly && !KITCHEN_ALLOWED.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/restaurant-kds", request.url));
  }

  const hideHome = request.cookies.get("hide_home")?.value === "1";
  if (hideHome && pathname === "/") {
    return NextResponse.redirect(new URL("/restaurant", request.url));
  }

  // Opening the app ("/") while logged in: straight to the shop's home screen from here, instead of
  // the server first asking Supabase who is logged in only to redirect (a round trip on every app
  // opening). The home screen still checks the login; a stale session ends up at /login as before.
  if (pathname === "/") {
    let home = "";
    try {
      home = decodeURIComponent(request.cookies.get("ray_home")?.value ?? "");
    } catch {
      // A garbled cookie: just show the page as before.
    }
    const loggedIn = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
    if (loggedIn && HOME_SCREENS.has(home)) return NextResponse.redirect(new URL(home, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
