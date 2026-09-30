"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { demoLocked } from "../demo/guard";
import { gapsReady, GAPS_NOT_READY } from "../gapsData";
import { ensureRentalBucket, RENTAL_PHOTO_BUCKET, type RentalPhoto } from "../rentalPhotos";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];
const STAGES = ["out", "in", "id"] as const;

/** A photo of the item as it goes out or comes back, or of the customer's ID. */
export async function uploadRentalPhotoAction(rentalId: string, stage: RentalPhoto["stage"], formData: FormData): Promise<{ error?: string }> {
  const session = await requireSession();
  const demoBlock = demoLocked(session);
  if (demoBlock) return { error: demoBlock };
  const admin = createSupabaseAdminClient();
  if (!(await gapsReady(admin))) return { error: GAPS_NOT_READY };
  if (!STAGES.includes(stage)) return { error: "Choose what the photo is of." };
  const { data: rental } = await admin.from("rentals").select("id, photos").eq("id", rentalId).eq("shop_id", session.shopId).maybeSingle();
  if (!rental) return { error: "Rental not found." };
  if ((rental.photos ?? []).length >= 20) return { error: "This rental already has 20 photos." };

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo." };
  if (file.size > MAX_BYTES) return { error: "The photo must be under 4MB." };
  if (!TYPES.includes(file.type)) return { error: "Use a JPG, PNG or WEBP photo." };

  await ensureRentalBucket(admin);
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${session.shopId}/${rental.id}/${stage}-${Date.now()}.${ext}`;
  const { error: uploadError } = await admin.storage.from(RENTAL_PHOTO_BUCKET).upload(path, file, { contentType: file.type });
  if (uploadError) return { error: "Could not upload the photo — try again." };
  const photos: RentalPhoto[] = [...(rental.photos ?? []), { url: path, stage, at: new Date().toISOString() }];
  const { error } = await admin.from("rentals").update({ photos }).eq("id", rental.id);
  if (error) {
    await admin.storage.from(RENTAL_PHOTO_BUCKET).remove([path]);
    return { error: "Could not save — try again." };
  }
  revalidatePath(`/rentals/${rentalId}`);
  return {};
}

export async function deleteRentalPhotoAction(rentalId: string, path: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  if (!(await gapsReady(admin))) return { error: GAPS_NOT_READY };
  const { data: rental } = await admin.from("rentals").select("id, photos").eq("id", rentalId).eq("shop_id", session.shopId).maybeSingle();
  if (!rental || !(rental.photos ?? []).some((p) => p.url === path)) return { error: "Photo not found." };
  await admin.storage.from(RENTAL_PHOTO_BUCKET).remove([path]);
  await admin.from("rentals").update({ photos: (rental.photos ?? []).filter((p) => p.url !== path) }).eq("id", rental.id);
  revalidatePath(`/rentals/${rentalId}`);
  return {};
}
