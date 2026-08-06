"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { round2 } from "../gst";

export type ActionState = { error?: string } | null;

export async function createVehicleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const name = formData.get("name");
  const vehicleNumber = formData.get("vehicleNumber");
  const ratePerKm = Number(formData.get("ratePerKm"));

  if (typeof name !== "string" || !name.trim()) return { error: "Enter a vehicle name" };
  if (Number.isNaN(ratePerKm) || ratePerKm < 0) return { error: "Enter a valid rate per km" };

  const { error } = await admin.from("vehicles").insert({
    shop_id: session.shopId,
    name: name.trim(),
    vehicle_number: typeof vehicleNumber === "string" && vehicleNumber.trim() ? vehicleNumber.trim().toUpperCase() : null,
    rate_per_km: ratePerKm,
  });
  if (error) {
    console.error("Could not add vehicle", error);
    return { error: "Could not add vehicle" };
  }

  revalidatePath("/transport/vehicles");
  return null;
}

export async function toggleVehicleActiveAction(vehicleId: string, isActive: boolean): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  await admin.from("vehicles").update({ is_active: isActive }).eq("id", vehicleId).eq("shop_id", session.shopId);
  revalidatePath("/transport/vehicles");
  return {};
}

export async function updateVehicleAction(
  vehicleId: string,
  name: string,
  vehicleNumber: string,
  ratePerKm: number,
): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!name.trim()) return { error: "Enter a vehicle name" };
  if (Number.isNaN(ratePerKm) || ratePerKm < 0) return { error: "Enter a valid rate per km" };

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("vehicles")
    .update({
      name: name.trim(),
      vehicle_number: vehicleNumber.trim() ? vehicleNumber.trim().toUpperCase() : null,
      rate_per_km: ratePerKm,
    })
    .eq("id", vehicleId)
    .eq("shop_id", session.shopId);
  if (error) {
    console.error("Could not update vehicle", error);
    return { error: "Could not update vehicle" };
  }
  revalidatePath("/transport/vehicles");
  return {};
}

export async function deleteVehicleAction(vehicleId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("vehicles").delete().eq("id", vehicleId).eq("shop_id", session.shopId);
  if (error) {
    // Foreign key violation — this vehicle has trip history that other
    // records point to, so it can't be deleted outright without losing
    // that history. Deactivating (already a button right next to this
    // one) is the correct move instead: it hides the vehicle from new
    // billing while keeping past reports intact.
    if (error.code === "23503") {
      return { error: "This vehicle has past trips on record and can't be deleted — use Deactivate instead to hide it from new bills." };
    }
    console.error("Could not delete vehicle", error);
    return { error: "Could not delete vehicle" };
  }
  revalidatePath("/transport/vehicles");
  return {};
}

/** Calculates one trip's transport charge for a given vehicle + distance —
 * a lightweight calculator, not a database write, since the trip only
 * becomes real once the bill it's part of is actually created (see
 * recordTripAction, called from createBillCore after the bill exists). */
export async function calculateTripChargeAction(
  vehicleId: string,
  km: number,
): Promise<{ vehicleName?: string; ratePerKm?: number; charge?: number; error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  if (!km || km <= 0) return { error: "Enter the distance covered" };

  const { data: vehicle } = await admin
    .from("vehicles")
    .select("id, name, rate_per_km")
    .eq("id", vehicleId)
    .eq("shop_id", session.shopId)
    .single();
  if (!vehicle) return { error: "Vehicle not found" };

  const charge = round2(km * Number(vehicle.rate_per_km));
  return { vehicleName: vehicle.name, ratePerKm: Number(vehicle.rate_per_km), charge };
}
