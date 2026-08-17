import { NextResponse, type NextRequest } from "next/server";

/** Routes a kitchen_only account should never leave — everything else
 * under the dashboard bounces back here, even via direct URL/bookmark,
 * not just at the moment of login. */
const KITCHEN_ALLOWED = ["/restaurant-kds", "/login", "/api"];

export function middleware(request: NextRequest) {
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
