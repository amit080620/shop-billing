import { getAuthenticatedUser } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logoutThisDeviceAction } from "@/lib/actions/auth";

/** Where a person the owner removed (Staff → Remove) lands: nothing of theirs was deleted, but no
 * screen opens until the owner gives the access back. Outside the shop's screens, so it never asks
 * for the session it refuses. */
export default async function AccessRemovedPage() {
  const user = await getAuthenticatedUser();
  let shopName = "this shop";
  if (user) {
    const admin = createSupabaseAdminClient();
    const { data: staff } = await admin.from("staff").select("shops ( name )").eq("id", user.id).maybeSingle();
    const shop = staff && (Array.isArray(staff.shops) ? staff.shops[0] : staff.shops);
    if (shop?.name) shopName = shop.name;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-bold text-white" style={{ background: "var(--brand)" }}>
        ₹
      </div>
      <div>
        <h1 className="text-lg font-bold tracking-tight text-foreground md:text-2xl">Access removed</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
          The owner of {shopName} has removed your access, so the app can&apos;t open here. Ask the owner if you need it back.
        </p>
      </div>
      <form action={logoutThisDeviceAction}>
        <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
          Log out
        </button>
      </form>
    </div>
  );
}
