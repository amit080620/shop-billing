import type { createSupabaseAdminClient } from "./supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Photos of a rental: the item going out, coming back, and the customer's ID. Kept in a private
 * bucket — an ID card must never sit behind a public link — and shown through short-lived links. */
export const RENTAL_PHOTO_BUCKET = "rental-photos";
export type RentalPhoto = { url: string; stage: "out" | "in" | "id"; at: string }; // url: the file's path in the bucket

let bucketReady = false;
export async function ensureRentalBucket(admin: Admin): Promise<void> {
  if (bucketReady) return;
  const { data } = await admin.storage.getBucket(RENTAL_PHOTO_BUCKET);
  if (!data) await admin.storage.createBucket(RENTAL_PHOTO_BUCKET, { public: false, fileSizeLimit: 4 * 1024 * 1024, allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"] });
  bucketReady = true;
}

/** Links that open each photo for an hour. */
export async function rentalPhotoLinks(admin: Admin, photos: RentalPhoto[]): Promise<(RentalPhoto & { link: string | null })[]> {
  if (!photos.length) return [];
  const { data } = await admin.storage.from(RENTAL_PHOTO_BUCKET).createSignedUrls(photos.map((p) => p.url), 3600);
  const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return photos.map((p) => ({ ...p, link: byPath.get(p.url) ?? null }));
}
