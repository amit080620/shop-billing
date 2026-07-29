import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logoutAction } from "@/lib/actions/auth";

export default async function SubscriptionExpiredPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let shopName = "your shop";
  if (user) {
    const admin = createSupabaseAdminClient();
    const { data: staff } = await admin
      .from("staff")
      .select("shops ( name )")
      .eq("id", user.id)
      .single();
    const shop = staff && (Array.isArray(staff.shops) ? staff.shops[0] : staff.shops);
    if (shop?.name) shopName = shop.name;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-bold text-white"
        style={{ background: "linear-gradient(135deg, var(--brand-light), var(--brand-dark))" }}
      >
        ₹
      </div>
      <div>
        <h1 className="text-lg font-semibold text-foreground">Subscription expired</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
          {shopName}&apos;s access to billing has paused — your data is safe and untouched.
          Contact whoever manages your subscription to renew it.
        </p>
      </div>
      <form action={logoutAction}>
        <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted">
          Log out
        </button>
      </form>
    </div>
  );
}
