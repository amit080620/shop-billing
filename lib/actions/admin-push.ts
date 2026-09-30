"use server";

import { requireSuperAdmin } from "../admin-auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { notifyTeam, pushReady, vapidKeys } from "../push";

const NOT_READY = "Notifications need a one-time database update — run migration 0051.";

/** The public half of the push key, which a phone needs to turn notifications on. */
export async function adminPushPublicKeyAction(): Promise<{ key?: string; error?: string }> {
  await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  if (!(await pushReady(admin))) return { error: NOT_READY };
  return { key: (await vapidKeys(admin)).publicKey };
}

/** This phone or browser will get the team's notifications. */
export async function saveAdminPushSubscriptionAction(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, label: string): Promise<{ error?: string }> {
  await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  if (!(await pushReady(admin))) return { error: NOT_READY };
  if (!/^https:\/\//.test(sub?.endpoint ?? "") || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "This browser didn't give a usable subscription." };
  const { error } = await admin
    .from("admin_push_subscriptions")
    .upsert({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, label: label.slice(0, 120) }, { onConflict: "endpoint" });
  if (error) return { error: "Could not save — try again." };
  return {};
}

export async function removeAdminPushSubscriptionAction(endpoint: string): Promise<{ error?: string }> {
  await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  if (!(await pushReady(admin))) return {};
  await admin.from("admin_push_subscriptions").delete().eq("endpoint", endpoint);
  return {};
}

export async function sendTestPushAction(): Promise<{ error?: string; phones?: number }> {
  await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  if (!(await pushReady(admin))) return { error: NOT_READY };
  const { count } = await admin.from("admin_push_subscriptions").select("id", { count: "exact", head: true });
  await notifyTeam(admin, { title: "The Ray — test", body: "Notifications work on this phone. New support requests will show up like this.", url: "/admin/support" });
  return { phones: count ?? 0 };
}
