import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";
import { createSupabaseAdminClient } from "./supabase/admin";

export type SessionContext = {
  userId: string;
  email: string | null;
  shopId: string;
  shopName: string;
  staffName: string;
  role: "owner" | "staff";
  shopStateCode: string | null;
  shopGstin: string | null;
  shopLogoUrl: string | null;
  shopUpiId: string | null;
  gstScheme: "regular" | "composition";
};

/**
 * Verifies the current session and loads the staff/shop record for it.
 * Redirects to /login if there's no session or no staff record.
 * The auth check and profile lookup are independent-ish, but the profile
 * lookup needs the user id from the auth check, so this stays sequential;
 * what matters is that callers use this ONE helper instead of re-querying.
 */
export async function requireSession(): Promise<SessionContext> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin = createSupabaseAdminClient();

  const [{ data: staff, error }, ] = await Promise.all([
    admin
      .from("staff")
      .select(
        "id, name, role, shop_id, shops ( name, state_code, gstin, gst_scheme, logo_url, upi_id )",
      )
      .eq("id", user.id)
      .single(),
  ]);

  if (error || !staff) {
    redirect("/login");
  }

  const shop = Array.isArray(staff.shops) ? staff.shops[0] : staff.shops;

  return {
    userId: user.id,
    email: user.email ?? null,
    shopId: staff.shop_id,
    shopName: shop?.name ?? "My Shop",
    staffName: staff.name,
    role: staff.role,
    shopStateCode: shop?.state_code ?? null,
    shopGstin: shop?.gstin ?? null,
    shopLogoUrl: shop?.logo_url ?? null,
    shopUpiId: shop?.upi_id ?? null,
    gstScheme: shop?.gst_scheme ?? "regular",
  };
}

export async function requireOwner(): Promise<SessionContext> {
  const session = await requireSession();
  if (session.role !== "owner") {
    redirect("/");
  }
  return session;
}
