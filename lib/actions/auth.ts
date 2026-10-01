"use server";

import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { createSupabaseServerClient } from "../supabase/server";
import { createSupabaseAdminClient } from "../supabase/admin";
import { signupSchema, loginSchema } from "../validation/schemas";
import { revalidateStaffCache } from "../auth";
import { getAuthenticatedUser } from "../supabase/server";
import { isDemoEmail } from "../demo/config";
import { hotelSchemaReady } from "../hotel/server";
import { notifyTeam } from "../push";
import { getTranslator } from "../i18n/server";
import { createClient } from "@supabase/supabase-js";

/** redirectTo: where the browser should go next. Login/signup finish with
 * a full page load instead of a server-action redirect — the redirect path
 * (action redirect, then "/" redirecting again) intermittently crashed the
 * Next.js router ("Rendered more hooks…"), which surfaced on phones as
 * "Application error" right after logging in. A full load also guarantees
 * the freshly deployed app is what runs after login. */
export type ActionState = { error?: string; redirectTo?: string } | null;

export async function signupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signupSchema.safeParse({
    shopName: formData.get("shopName"),
    businessType: formData.get("businessType") || "general",
    stateCode: formData.get("stateCode"),
    ownerName: formData.get("ownerName"),
    ownerPhone: formData.get("ownerPhone"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }
  const { shopName, businessType, stateCode, ownerName, ownerPhone, email, password } = parsed.data;

  const admin = createSupabaseAdminClient();

  // A hotel shop needs the hotel tables (migration 0041); without them the
  // shop insert would fail after the auth user was already created.
  if (businessType === "hotel" && !(await hotelSchemaReady(admin))) {
    return { error: "Hotel accounts are not switched on yet. Please pick another business type for now." };
  }

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

  // Every new shop tries the whole app for 14 days and then settles on
  // the Free plan — no card, no lockout, and the counter keeps billing.
  // A super admin assigns a paid plan from /admin once payment arrives.
  // trial_ends_at is the last day of the trial, inclusive, and sign-up day
  // is day 1 — so +13 gives exactly 14 days, and Home says "14 more days".
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 13);

  let { data: shop, error: shopError } = await admin
    .from("shops")
    .insert({
      name: shopName,
      business_type: businessType,
      state_code: stateCode,
      business_type_locked: true,
      plan: "free",
      trial_ends_at: trialEnds.toISOString().slice(0, 10),
      owner_phone: ownerPhone,
    })
    .select("id")
    .single();
  // Before migration 0040 the plan columns don't exist and the insert
  // fails on them. Signing up must keep working through that gap, so fall
  // back to the original shape: a 14-day subscription window, no plan.
  if (shopError && (shopError.code === "42703" || shopError.code === "PGRST204")) {
    ({ data: shop, error: shopError } = await admin
      .from("shops")
      .insert({
        name: shopName,
        business_type: businessType,
        state_code: stateCode,
        business_type_locked: true,
        subscription_valid_until: trialEnds.toISOString().slice(0, 10),
      })
      .select("id")
      .single());
  }
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

  await revalidateStaffCache(authData.user.id);
  // A new shop: the team's phones hear about it, with the owner's number to welcome them.
  await notifyTeam(admin, { title: "New shop signed up", body: `${shopName} (${businessType}) · ${ownerName} · ${ownerPhone}`, url: `/admin/shops/${shop.id}` });
  return { redirectTo: "/" };
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
    await revalidateStaffCache(authData.user.id);
    return { redirectTo: "/restaurant-kds" };
  }
  if (staffRow && staffRow.role !== "owner" && shop?.business_type === "restaurant") {
    await revalidateStaffCache(authData.user.id);
    return { redirectTo: "/restaurant" };
  }

  await revalidateStaffCache(authData.user.id);
  return { redirectTo: "/" };
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
  // Every visitor of a demo shop is the same login: signing out "everywhere" would log the others out too.
  const user = await getAuthenticatedUser();
  await supabase.auth.signOut({ scope: isDemoEmail(user?.email) ? "local" : "global" });
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

  // Sent with the implicit flow: the link carries its own one-time tokens, so it works on whatever
  // phone or browser the email is opened in. (The cookie-based flow only worked in the same browser
  // the request was made from — not from the Gmail app.) /reset-password turns the link into a session.
  const mailer = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bill.theray.in";
  const { error } = await mailer.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${siteUrl}/reset-password`,
  });

  // Supabase's email sender is out of sends for now (its built-in sender allows only a few an hour
  // for the whole app). That says nothing about this email address, so it is safe to say so — and
  // the person can ask the team instead of waiting for an email that won't come.
  if (error && (error.status === 429 || error.code === "over_email_send_rate_limit")) {
    console.error("Password reset email rate-limited", error);
    const { t } = await getTranslator();
    return { error: t("Too many reset emails are going out right now. Use “Email didn't come? Ask The Ray team” below — we'll reset it and call you.") };
  }
  // Always report success even if the email doesn't exist — this is
  // intentional and standard practice, since confirming "no account
  // with that email" would let anyone probe which emails have accounts.
  if (error) console.error("Could not send password reset email", error);
  return { success: true };
}

/** "The email didn't come": the shop owner asks The Ray's team to reset the password instead. It
 * lands in Admin → Support for the shop that email belongs to (with a push to the team's phones);
 * the team resets it from the shop's page and calls the number given. Always answers "sent", so it
 * can't be used to find out which emails have accounts; shares the 3-an-hour limit with reset emails. */
export async function requestPasswordHelpAction(
  _prev: { error?: string; success?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").replace(/\D/g, "").slice(-10);
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter the email you log in with" };
  if (!/^[6-9]\d{9}$/.test(phone)) return { error: "Enter your 10-digit mobile number" };

  const admin = createSupabaseAdminClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recent } = await admin.from("password_reset_requests").select("id", { count: "exact", head: true }).eq("email", email).gte("created_at", oneHourAgo);
  if ((recent ?? 0) >= 3) return { success: true };
  await admin.from("password_reset_requests").insert({ email });

  // Whose login is it? (Emails live in Supabase Auth, not in our tables.)
  let userId: string | null = null;
  for (let page = 1; page <= 10 && !userId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users.length) break;
    userId = data.users.find((u) => (u.email ?? "").toLowerCase() === email)?.id ?? null;
    if (data.users.length < 1000) break;
  }
  const { data: staff } = userId ? await admin.from("staff").select("shop_id, name, role, shops ( name )").eq("id", userId).maybeSingle() : { data: null };
  const shopName = (Array.isArray(staff?.shops) ? staff?.shops[0] : (staff?.shops as { name: string } | null | undefined))?.name ?? null;

  if (staff?.shop_id) {
    await admin.from("sales_enquiries").insert({
      shop_id: staff.shop_id,
      kind: "custom",
      item: `[Support/technical] Password reset requested for ${email} (${staff.name}, ${staff.role}). Call ${phone}. Set a new password from the shop's page → Staff → Reset password.`,
    });
  }
  await notifyTeam(admin, {
    title: "Password help requested",
    body: shopName ? `${shopName}: ${email} · call ${phone}` : `${email} · call ${phone} — no account found for this email`,
    url: staff?.shop_id ? `/admin/shops/${staff.shop_id}` : "/admin/support",
  });
  return { success: true };
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = formData.get("password");
  if (typeof password !== "string" || password.length < 6) return { error: "Password must be at least 6 characters" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("Could not reset password", error);
    return { error: "Could not reset password — the link may have expired. Request a new one." };
  }

  return { redirectTo: "/" };
}
