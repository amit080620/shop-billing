import "server-only";
import webpush from "web-push";
import type { createSupabaseAdminClient } from "./supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

let ready = false;
/** Whether migration 0051 (admin push notifications) has been applied. */
export async function pushReady(admin: Admin): Promise<boolean> {
  if (ready) return true;
  const { error } = await admin.from("admin_push_subscriptions").select("id").limit(1);
  if (error) return false;
  ready = true;
  return true;
}

let keys: { publicKey: string; privateKey: string } | null = null;
/** The platform's push key pair: made once, the first time anyone turns notifications on, and
 * kept in app_secrets (server only). */
export async function vapidKeys(admin: Admin): Promise<{ publicKey: string; privateKey: string }> {
  if (keys) return keys;
  const { data } = await admin.from("app_secrets").select("key, value").in("key", ["vapid_public", "vapid_private"]);
  const pub = data?.find((r) => r.key === "vapid_public")?.value;
  const priv = data?.find((r) => r.key === "vapid_private")?.value;
  if (pub && priv) return (keys = { publicKey: pub, privateKey: priv });
  const made = webpush.generateVAPIDKeys();
  // Two phones turning notifications on at once: the first pair saved wins, and both read it back.
  await admin.from("app_secrets").upsert([{ key: "vapid_public", value: made.publicKey }, { key: "vapid_private", value: made.privateKey }], { onConflict: "key", ignoreDuplicates: true });
  const { data: again } = await admin.from("app_secrets").select("key, value").in("key", ["vapid_public", "vapid_private"]);
  return (keys = {
    publicKey: again?.find((r) => r.key === "vapid_public")?.value ?? made.publicKey,
    privateKey: again?.find((r) => r.key === "vapid_private")?.value ?? made.privateKey,
  });
}

/** A notification to every phone of The Ray's team that turned them on. Never throws and never
 * holds up the shop for more than a few seconds — the shop's request is already saved. */
export async function notifyTeam(admin: Admin, message: { title: string; body: string; url: string; tag?: string }): Promise<void> {
  try {
    if (!(await pushReady(admin))) return;
    const { data: subs } = await admin.from("admin_push_subscriptions").select("id, endpoint, p256dh, auth");
    if (!subs?.length) return;
    const { publicKey, privateKey } = await vapidKeys(admin);
    const payload = JSON.stringify({ ...message, body: message.body.slice(0, 180) });
    const send = Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
            vapidDetails: { subject: "https://bill.theray.in", publicKey, privateKey },
            TTL: 60 * 60 * 24,
            urgency: "high",
          });
        } catch (error) {
          // The phone turned them off or the subscription expired: forget it.
          const code = (error as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await admin.from("admin_push_subscriptions").delete().eq("id", s.id);
          else console.error("Push notification failed", code, error);
        }
      }),
    );
    await Promise.race([send, new Promise((r) => setTimeout(r, 4000))]);
  } catch (error) {
    console.error("Could not notify the team", error);
  }
}
