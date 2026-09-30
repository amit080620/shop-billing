import type { createSupabaseAdminClient } from "./supabase/admin";
import { salonExtrasReady } from "./salonExtras";
import { goldSchemesReady } from "./goldSchemeData";
import { cashMovementsReady } from "./cashMovements";
import { transportExtrasReady } from "./transportData";
import { giveBackForBill, recipesReady } from "./recipeData";
import { reopenChallansOfBill } from "./challanData";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** A voided bill no longer counts, so whatever it used is given back: a gold scheme it redeemed
 * runs again, a package session it took is returned, prepaid balance it spent goes back on the
 * customer's balance, a package it sold is cancelled — and the drawer entries that took an advance
 * off that day's takings go too (the bill's own takings stop counting when it is voided). */
export async function undoBillUsage(admin: Admin, shopId: string, billId: string): Promise<void> {
  try {
    if (await salonExtrasReady(admin)) {
      await admin.from("cash_movements").delete().eq("shop_id", shopId).eq("bill_id", billId);
      await admin.from("package_uses").delete().eq("shop_id", shopId).eq("bill_id", billId);
      await admin.from("wallet_entries").delete().eq("shop_id", shopId).eq("bill_id", billId).eq("kind", "spend");
      await admin.from("customer_packages").update({ status: "cancelled" }).eq("shop_id", shopId).eq("sold_bill_id", billId);
    }
    // Entries made before bills were recorded on them are found through what the bill used.
    if (await goldSchemesReady(admin)) {
      const { data: schemes } = await admin.from("gold_schemes").select("id").eq("shop_id", shopId).eq("redeemed_bill_id", billId);
      for (const s of schemes ?? []) {
        await admin.from("gold_schemes").update({ status: "active", redeemed_bill_id: null, redeemed_at: null }).eq("id", s.id);
        await admin.from("cash_movements").delete().eq("shop_id", shopId).eq("source", "gold_scheme").eq("source_id", s.id).eq("kind", "advance_applied");
      }
    }
    if (await cashMovementsReady(admin)) {
      const { data: jobs } = await admin.from("service_jobs").select("id").eq("shop_id", shopId).eq("bill_id", billId);
      for (const j of jobs ?? []) {
        await admin.from("cash_movements").delete().eq("shop_id", shopId).eq("source", "service_job").eq("source_id", j.id).eq("kind", "advance_applied");
      }
    }
    // Raw materials a recipe took for it go back on the shelf.
    if (await recipesReady(admin)) await giveBackForBill(admin, shopId, billId);
    // A freight bill voided: its LRs are waiting to be billed again.
    if (await transportExtrasReady(admin)) {
      await admin.from("consignments").update({ bill_id: null }).eq("shop_id", shopId).eq("bill_id", billId);
    }
    // A bill made from delivery challans voided: the challans are open again.
    await reopenChallansOfBill(admin, shopId, billId);
  } catch (error) {
    console.error("Could not undo what a voided bill used", billId, error);
  }
}
