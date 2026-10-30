"use server";

import { redirect } from "next/navigation";
import { checkManagerPin } from "../managerPin";
import { logAuditEvent } from "../audit";
import { revalidatePath } from "next/cache";
import { requireSession, requireArea } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { moveStock, round3 } from "../stockMoves";

export async function startAuditAction(): Promise<{ auditId?: string; error?: string }> {
  const session = await requireSession();
  requireArea(session, "manage_products");
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
  requireArea(session, "manage_products");
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
  if (countedQuantity !== null && (!Number.isFinite(countedQuantity) || countedQuantity < 0)) {
    return { error: "Enter a valid count (0 or more)" };
  }

  const { error } = await admin
    .from("stock_audit_items")
    .update({ counted_quantity: countedQuantity })
    .eq("id", itemId);
  if (error) return { error: "Could not save count" };
  return {};
}

export async function completeAuditAction(auditId: string, managerPin: string | null = null): Promise<{ error?: string }> {
  const session = await requireSession();
  requireArea(session, "manage_products");
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
    .select("id, product_id, counted_quantity, system_quantity")
    .eq("audit_id", auditId)
    .not("counted_quantity", "is", null);

  // Apply only the difference the count found (counted − what the system showed when counting
  // began), on top of today's stock. Setting the stock straight to the counted number wiped out
  // every sale and purchase made while staff were still counting — the shop stays open meanwhile.
  const { data: owned } = await admin
    .from("products")
    .select("id")
    .eq("shop_id", session.shopId)
    .in("id", (items ?? []).map((i) => i.product_id).filter(Boolean) as string[]);
  const ownedIds = new Set((owned ?? []).map((p) => p.id));
  const changes = (items ?? []).filter((i) => i.counted_quantity != null && i.product_id && ownedIds.has(i.product_id) && Math.abs(Number(i.counted_quantity) - Number(i.system_quantity)) > 1e-9);
  // A count that changes stock is the same as typing a new count on the item: it needs the manager PIN.
  if (changes.length) {
    const pinError = await checkManagerPin(admin, session, managerPin, `change the stock of ${changes.length} item(s)`);
    if (pinError) return { error: pinError };
  }
  // Completed first, and only from draft: a second tap (or another phone) applies the count once.
  const { data: claimed } = await admin
    .from("stock_audits")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", auditId)
    .eq("status", "draft")
    .select("id");
  if (!claimed?.length) return { error: "Already completed" };

  // Every difference in one go. Found more: added. Found fewer: taken off, never below zero — if
  // today's stock is already lower than the count's shortfall (sold while counting), it stops at
  // zero and that is written down. An item already below zero is corrected upward by its count.
  const moved = await moveStock(admin, {
    shopId: session.shopId,
    staffId: session.userId,
    source: "stock_count",
    sourceId: auditId,
    give: changes.filter((c) => Number(c.counted_quantity) > Number(c.system_quantity)).map((c) => ({ productId: c.product_id, quantity: round3(Number(c.counted_quantity) - Number(c.system_quantity)) })),
    take: changes.filter((c) => Number(c.counted_quantity) < Number(c.system_quantity)).map((c) => ({ productId: c.product_id, quantity: round3(Number(c.system_quantity) - Number(c.counted_quantity)) })),
    allowShort: true,
  });
  if (!moved.ok && moved.refused) {
    // Nothing moved: the count can be completed again.
    await admin.from("stock_audits").update({ status: "draft", completed_at: null }).eq("id", auditId);
    return { error: moved.error };
  }
  // No answer: it may or may not have gone through, so it isn't offered again (that could apply it twice).
  if (!moved.ok) return { error: "The count was saved, but the connection dropped while stock was updated — check a few counted items' stock before changing anything." };
  if (changes.length) {
    const { data: names } = await admin.from("products").select("id, name, unit").in("id", changes.map((c) => c.product_id!));
    const nameOf = new Map((names ?? []).map((p) => [p.id, p]));
    await logAuditEvent({
      admin,
      shopId: session.shopId,
      staffId: session.userId,
      action: "stock_count_applied",
      entityType: "stock_audit",
      entityId: auditId,
      details: {
        items: changes.map((c) => ({ name: nameOf.get(c.product_id!)?.name ?? "(deleted item)", unit: nameOf.get(c.product_id!)?.unit ?? "", system: Number(c.system_quantity), counted: Number(c.counted_quantity) })),
      },
      by: { name: session.staffName, role: session.role },
    });
  }

  revalidatePath("/products");
  revalidatePath(`/stock-audit/${auditId}`);
  revalidatePath("/stock-audit");
  redirect(`/stock-audit/${auditId}`);
}

export async function discardAuditAction(auditId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  requireArea(session, "manage_products");
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
