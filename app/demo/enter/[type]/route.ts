import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidateStaffCache } from "@/lib/auth";
import { checkRateLimitAsync } from "@/lib/rateLimit";
import { isDemoType } from "@/lib/demo/config";
import { ensureDemoShop } from "@/lib/demo";

export const dynamic = "force-dynamic";
// Filling a demo shop from scratch (the first visit after a nightly reset) can take a minute.
export const maxDuration = 300;

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>body{font-family:system-ui,sans-serif;background:#0f0d24;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}main{max-width:420px;text-align:center}a{color:#a5b4fc}</style></head><body><main><h1 style="font-size:20px">${title}</h1><p style="color:#c7c9e6;line-height:1.5">${body}</p><p><a href="/demo">Back to the demos</a></p></main></body></html>`;
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

/** Opens a demo shop without any login: makes sure it is filled and fresh, signs in as its
 * (demo-only) owner, and lands on that business's home screen. */
export async function GET(request: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!isDemoType(type)) return NextResponse.redirect(new URL("/demo", request.url));

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await checkRateLimitAsync(`demo-enter:${ip}`, 40, 10 * 60_000))) {
    return page("Too many tries", "Please wait a few minutes and open the demo again.", 429);
  }

  let login: Awaited<ReturnType<typeof ensureDemoShop>>;
  try {
    login = await ensureDemoShop(type);
  } catch (error) {
    console.error("Demo could not be prepared", type, error);
    return page("The demo is warming up", "This demo is being refreshed right now. Please try again in a minute.", 503);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: login.email, password: login.password });
  if (error) {
    console.error("Demo sign-in failed", type, error.message);
    return page("The demo is warming up", "Could not open the demo just now. Please try again in a minute.", 503);
  }
  await revalidateStaffCache(login.userId);
  const cookieStore = await cookies();
  cookieStore.delete("kitchen_only");
  cookieStore.delete("hide_home");
  // The restaurant's tables and the hotel's front desk are the best first look; for the rest the
  // dashboard (sales, money owed, what needs attention) shows the shop at a glance.
  redirect(type === "restaurant" ? "/restaurant" : type === "hotel" ? "/hotel" : "/dashboard");
}
