"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../supabase/server";
import { createSupabaseAdminClient } from "../supabase/admin";
import { signupSchema, loginSchema } from "../validation/schemas";

export type ActionState = { error?: string } | null;

export async function signupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signupSchema.safeParse({
    shopName: formData.get("shopName"),
    businessType: formData.get("businessType") || "general",
    ownerName: formData.get("ownerName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { shopName, businessType, ownerName, email, password } = parsed.data;

  const admin = createSupabaseAdminClient();

  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (authError || !authData.user) {
    return { error: authError?.message ?? "Could not create account" };
  }

  // New shops get a 14-day trial by default — a super admin extends this
  // via /admin once the shop is on a paid plan. Existing shops created
  // before this rolled out keep their unlimited access (NULL), untouched.
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 14);

  const { data: shop, error: shopError } = await admin
    .from("shops")
    .insert({ name: shopName, business_type: businessType, business_type_locked: true, subscription_valid_until: trialEnds.toISOString().slice(0, 10) })
    .select("id")
    .single();
  if (shopError || !shop) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return { error: "Could not create shop. Please try again." };
  }

  const { error: staffError } = await admin.from("staff").insert({
    id: authData.user.id,
    shop_id: shop.id,
    name: ownerName,
    role: "owner",
  });
  if (staffError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return { error: "Could not set up your staff profile. Please try again." };
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    return { error: "Account created — please log in." };
  }

  redirect("/");
}

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !authData.user) {
    return { error: "Incorrect email or password" };
  }

  // Restaurant staff/managers live on the Tables screen all day — send
  // them straight there instead of the generic Home dashboard. Owners
  // still land on Home, since they care about the overview first.
  const admin = createSupabaseAdminClient();
  const { data: staffRow } = await admin
    .from("staff")
    .select("role, shop_id, shops ( business_type )")
    .eq("id", authData.user.id)
    .single();
  const shop = staffRow ? (Array.isArray(staffRow.shops) ? staffRow.shops[0] : staffRow.shops) : null;
  if (staffRow && staffRow.role !== "owner" && shop?.business_type === "restaurant") {
    redirect("/restaurant");
  }

  redirect("/");
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
