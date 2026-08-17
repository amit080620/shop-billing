"use server";

import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
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

  // Max 10 signups per IP per hour — guards against a bot mass-creating
  // fake shops, distinct from login_attempts (credential brute-forcing).
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headersList.get("x-real-ip") ?? "unknown";
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentSignups } = await admin
    .from("signup_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_address", ip)
    .gte("created_at", oneHourAgo);
  if ((recentSignups ?? 0) >= 10) {
    return { error: "Too many signup attempts from this network. Please try again later." };
  }
  await admin.from("signup_attempts").insert({ ip_address: ip });

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

  const admin = createSupabaseAdminClient();
  const email = parsed.data.email.trim().toLowerCase();

  // Rate limit: 5+ failed attempts for this email in the last 15
  // minutes blocks further tries, regardless of whether this password
  // happens to be correct — stops targeted brute-forcing of one account.
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count: recentFailures } = await admin
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .eq("succeeded", false)
    .gte("created_at", fifteenMinAgo);
  if ((recentFailures ?? 0) >= 5) {
    return { error: "Too many failed attempts. Please wait 15 minutes and try again." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error } = await supabase.auth.signInWithPassword(parsed.data);

  await admin.from("login_attempts").insert({ email, succeeded: !error && !!authData?.user });

  if (error || !authData.user) {
    return { error: "Incorrect email or password" };
  }

  // Restaurant staff/managers live on the Tables screen all day — send
  // them straight there instead of the generic Home dashboard. Owners
  // still land on Home, since they care about the overview first.
  const { data: staffRow } = await admin
    .from("staff")
    .select("role, permissions, shop_id, shops ( business_type )")
    .eq("id", authData.user.id)
    .single();
  const shop = staffRow ? (Array.isArray(staffRow.shops) ? staffRow.shops[0] : staffRow.shops) : null;
  const permissions = (staffRow?.permissions as string[] | null) ?? [];
  const cookieStore = await cookies();
  if (staffRow?.role !== "owner" && permissions.includes("kitchen_only")) {
    cookieStore.set("kitchen_only", "1", { path: "/", maxAge: 60 * 60 * 24 * 30 });
  } else {
    cookieStore.delete("kitchen_only");
  }
  if (staffRow?.role === "staff" && shop?.business_type === "restaurant" && !permissions.includes("view_home")) {
    cookieStore.set("hide_home", "1", { path: "/", maxAge: 60 * 60 * 24 * 30 });
  } else {
    cookieStore.delete("hide_home");
  }

  if (permissions.includes("kitchen_only")) {
    redirect("/restaurant-kds");
  }
  if (staffRow && staffRow.role !== "owner" && shop?.business_type === "restaurant") {
    redirect("/restaurant");
  }

  redirect("/");
}

/** Signs out only this browser/device — other devices where the same
 * account is logged in stay logged in. Supabase's default signOut()
 * scope is 'global' (every device), which is why this needs to be
 * explicit rather than relying on the default. */
export async function logoutThisDeviceAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  const cookieStore = await cookies();
  cookieStore.delete("kitchen_only");
  cookieStore.delete("hide_home");
  redirect("/login");
}

/** Signs out everywhere — every device currently logged into this
 * account, not just the one this was triggered from. Useful if a
 * device was lost or a password was just changed for safety. */
export async function logoutAllDevicesAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "global" });
  const cookieStore = await cookies();
  cookieStore.delete("kitchen_only");
  cookieStore.delete("hide_home");
  redirect("/login");
}

export async function forgotPasswordAction(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const email = formData.get("email");
  if (typeof email !== "string" || !email.trim()) return { error: "Enter your email" };
  const normalizedEmail = email.trim().toLowerCase();

  const admin = createSupabaseAdminClient();

  // Max 3 reset emails per address per hour — guards against someone
  // spamming a victim's inbox, without needing external infra.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentRequests } = await admin
    .from("password_reset_requests")
    .select("id", { count: "exact", head: true })
    .eq("email", normalizedEmail)
    .gte("created_at", oneHourAgo);
  if ((recentRequests ?? 0) >= 3) {
    // Same "always succeed" principle as below — don't reveal whether
    // the limit hit is because of a real account or an unknown email.
    return { success: true };
  }
  await admin.from("password_reset_requests").insert({ email: normalizedEmail });

  const supabase = await createSupabaseServerClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${siteUrl}/reset-password`,
  });

  // Always report success even if the email doesn't exist — this is
  // intentional and standard practice, since confirming "no account
  // with that email" would let anyone probe which emails have accounts.
  if (error) console.error("Could not send password reset email", error);
  return { success: true };
}

export async function resetPasswordAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string } | null> {
  const password = formData.get("password");
  if (typeof password !== "string" || password.length < 6) return { error: "Password must be at least 6 characters" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("Could not reset password", error);
    return { error: "Could not reset password — the link may have expired. Request a new one." };
  }

  redirect("/");
}
