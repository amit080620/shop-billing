import "server-only";
import type { createSupabaseAdminClient } from "../supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Photos of van trip expenses (a diesel slip, a toll receipt) and shop visits (a closed shutter).
 * Kept in a private bucket and shown through short-lived links, like rental photos. The phone shrinks
 * a photo before sending it, so one is a few dozen KB on a slow connection. */
export const VAN_PHOTO_BUCKET = "van-photos";
export const VAN_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const VAN_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

let bucketReady = false;
export async function ensureVanPhotoBucket(admin: Admin): Promise<void> {
  if (bucketReady) return;
  const { data } = await admin.storage.getBucket(VAN_PHOTO_BUCKET);
  if (!data) await admin.storage.createBucket(VAN_PHOTO_BUCKET, { public: false, fileSizeLimit: VAN_PHOTO_MAX_BYTES, allowedMimeTypes: VAN_PHOTO_TYPES });
  bucketReady = true;
}

/** Links that open each photo for an hour, by its path. */
export async function vanPhotoLinks(admin: Admin, paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(paths.filter((p): p is string => !!p))];
  if (!wanted.length) return new Map();
  const { data } = await admin.storage.from(VAN_PHOTO_BUCKET).createSignedUrls(wanted, 3600);
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as [string, string]] : [])));
}
