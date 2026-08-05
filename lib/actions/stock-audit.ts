"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";

export async function startAuditAction(): Promise<{ auditId?: string; error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: products } = await admin
    .from("products")
    .select("id, name, unit, stock_quantity")
    .eq("shop_id", session.shopId)
    .eq("track_inventory", true)
    .order("name");

  if (!products || products.length === 0) {
    return { error: "No tracked products to count — turn on stock tracking for at least one item first." };
  }

  const { data: audit, error } = await admin
    .from("stock_audits")
    .insert({ shop_id: session.shopId, staff_id: session.userId })
    .select("id")
    .single();
  if (error || !audit) {
    console.error("Could not start audit", error);
    return { error: "Could not start audit" };
  }

  const { error: itemsError } = await admin.from("stock_audit_items").insert(
    products.map((p) => ({
      audit_id: audit.id,
      product_id: p.id,
      product_name: p.name,
      unit: p.unit,
      system_quantity: p.stock_quantity,
    })),
  );
  if (itemsError) {
    await admin.from("stock_audits").delete().eq("id", audit.id);
    return { error: "Could not prepare audit list" };
  }

  return { auditId: audit.id };
}

export async function updateAuditItemAction(
  itemId: string,
  countedQuantity: number | null,
): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  // Ownership check via the parent audit's shop_id.
  const { data: item } = await admin
    .from("stock_audit_items")
    .select("id, audit_id, stock_audits!inner ( shop_id, status )")
    .eq("id", itemId)
    .single();
  const audit = item ? (Array.isArray(item.stock_audits) ? item.stock_audits[0] : item.stock_audits) : null;
  if (!item || !audit || audit.shop_id !== session.shopId) return { error: "Item not found" };
  if (audit.status !== "draft") return { error: "This audit is already completed" };

  const { error } = await admin
    .from("stock_audit_items")
    .update({ counted_quantity: countedQuantity })
    .eq("id", itemId);
  if (error) return { error: "Could not save count" };
  return {};
}

export async function completeAuditAction(auditId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: audit } = await admin
    .from("stock_audits")
    .select("id, status")
    .eq("id", auditId)
    .eq("shop_id", session.shopId)
    .single();
  if (!audit) return { error: "Audit not found" };
  if (audit.status !== "draft") return { error: "Already completed" };

  const { data: items } = await admin
    .from("stock_audit_items")
    .select("id, product_id, counted_quantity")
    .eq("audit_id", auditId)
    .not("counted_quantity", "is", null);

  for (const item of items ?? []) {
    if (item.counted_quantity == null) continue;
    await admin
      .from("products")
      .update({ stock_quantity: item.counted_quantity })
      .eq("id", item.product_id)
      .eq("shop_id", session.shopId);
  }

  await admin
    .from("stock_audits")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", auditId);

  revalidatePath("/products");
  revalidatePath(`/stock-audit/${auditId}`);
  revalidatePath("/stock-audit");
  redirect(`/stock-audit/${auditId}`);
}

export async function discardAuditAction(auditId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { data: audit } = await admin
    .from("stock_audits")
    .select("id, status")
    .eq("id", auditId)
    .eq("shop_id", session.shopId)
    .single();
  if (!audit || audit.status !== "draft") return { error: "Cannot discard" };
  await admin.from("stock_audits").delete().eq("id", auditId);
  revalidatePath("/stock-audit");
  return {};
}
