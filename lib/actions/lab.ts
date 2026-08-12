"use server";

import { revalidatePath } from "next/cache";
import { requireOwner, requireSession } from "../auth";
import { createSupabaseAdminClient } from "../supabase/admin";
import { financialYearFor, round2 } from "../gst";

export type ActionState = { error?: string } | null;

// ─── Test catalog ────────────────────────────────────────────────────────

export async function createLabTestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const name = formData.get("name");
  const category = formData.get("category");
  const sampleType = formData.get("sampleType");
  const price = Number(formData.get("price"));
  const gstPercent = Number(formData.get("gstPercent")) || 0;
  const turnaroundHours = Number(formData.get("turnaroundHours")) || 24;
  const referenceRange = formData.get("referenceRange");
  const unit = formData.get("unit");

  if (typeof name !== "string" || !name.trim()) return { error: "Enter a test name" };
  if (!price || price < 0) return { error: "Enter a valid price" };

  const { error } = await admin.from("lab_tests").insert({
    shop_id: session.shopId,
    name: name.trim(),
    category: typeof category === "string" && category.trim() ? category.trim() : null,
    sample_type: (typeof sampleType === "string" ? sampleType : "blood") as "blood" | "urine" | "stool" | "swab" | "other",
    price,
    gst_percent: gstPercent,
    turnaround_hours: turnaroundHours,
    reference_range: typeof referenceRange === "string" && referenceRange.trim() ? referenceRange.trim() : null,
    unit: typeof unit === "string" && unit.trim() ? unit.trim() : null,
  });
  if (error) {
    console.error("Could not create lab test", error);
    return { error: "Could not create test" };
  }
  revalidatePath("/lab/tests");
  return null;
}

export async function toggleLabTestActiveAction(testId: string, isActive: boolean): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("lab_tests").update({ is_active: isActive }).eq("id", testId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not update test" };
  revalidatePath("/lab/tests");
  return {};
}

export async function deleteLabTestAction(testId: string): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("lab_tests").delete().eq("id", testId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not delete test" };
  revalidatePath("/lab/tests");
  return {};
}

// ─── Packages/profiles ──────────────────────────────────────────────────

export async function createLabPackageAction(name: string, testIds: string[]): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  if (!name.trim()) return { error: "Enter a package name" };
  if (testIds.length === 0) return { error: "Add at least one test" };

  const { data: tests } = await admin.from("lab_tests").select("id, price, gst_percent").eq("shop_id", session.shopId).in("id", testIds);
  const price = round2((tests ?? []).reduce((s, t) => s + Number(t.price), 0));
  const avgGst = tests && tests.length > 0 ? round2((tests ?? []).reduce((s, t) => s + Number(t.gst_percent), 0) / tests.length) : 0;

  const { data: pkg, error } = await admin.from("lab_packages").insert({ shop_id: session.shopId, name: name.trim(), price, gst_percent: avgGst }).select("id").single();
  if (error || !pkg) return { error: "Could not create package" };

  await admin.from("lab_package_tests").insert(testIds.map((testId) => ({ package_id: pkg.id, test_id: testId })));
  revalidatePath("/lab/tests");
  return {};
}

export async function deleteLabPackageAction(packageId: string): Promise<{ error?: string }> {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("lab_packages").delete().eq("id", packageId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not delete package" };
  revalidatePath("/lab/tests");
  return {};
}

// ─── Orders (booking) ────────────────────────────────────────────────────

export async function createLabOrderAction(input: {
  patientId: string | null;
  patientName: string;
  patientPhone: string;
  patientAge: string;
  patientGender: string;
  referringDoctorName: string;
  collectionType: "walk_in" | "home_collection";
  homeAddress: string;
  collectionSlot: string;
  phlebotomistId: string | null;
  testIds: string[];
  packageIds: string[];
}): Promise<{ error?: string; orderId?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  if (!input.patientName.trim()) return { error: "Enter the patient's name" };
  if (!input.patientPhone.trim()) return { error: "Enter a phone number" };
  if (input.testIds.length === 0 && input.packageIds.length === 0) return { error: "Select at least one test or package" };
  if (input.collectionType === "home_collection" && !input.homeAddress.trim()) return { error: "Enter the home collection address" };

  const financialYear = financialYearFor(new Date());
  const { data: issuedNumber } = await admin.rpc("next_lab_order_number", { p_shop_id: session.shopId, p_financial_year: financialYear });
  const orderNumber = `${financialYear}/LAB${String(issuedNumber ?? 0).padStart(5, "0")}`;

  const { data: order, error } = await admin
    .from("lab_orders")
    .insert({
      shop_id: session.shopId,
      order_number: orderNumber,
      financial_year: financialYear,
      patient_id: input.patientId,
      patient_name: input.patientName.trim(),
      patient_phone: input.patientPhone.trim(),
      patient_age: input.patientAge || null,
      patient_gender: (input.patientGender || null) as "male" | "female" | "other" | null,
      referring_doctor_name: input.referringDoctorName.trim() || null,
      collection_type: input.collectionType,
      home_address: input.collectionType === "home_collection" ? input.homeAddress.trim() : null,
      collection_slot: input.collectionSlot || null,
      phlebotomist_id: input.phlebotomistId,
      staff_id: session.userId,
    })
    .select("id")
    .single();
  if (error || !order) {
    console.error("Could not create lab order", error);
    return { error: "Could not create order" };
  }

  const { data: individualTests } = input.testIds.length
    ? await admin.from("lab_tests").select("id, name, reference_range, unit, price, gst_percent").in("id", input.testIds)
    : { data: [] };

  const { data: packages } = input.packageIds.length
    ? await admin.from("lab_packages").select("id, name, price, gst_percent, lab_package_tests ( test_id, lab_tests ( name, reference_range, unit ) )").in("id", input.packageIds)
    : { data: [] };

  const items: {
    order_id: string;
    test_id: string | null;
    test_name: string;
    reference_range: string | null;
    unit: string | null;
    price: number;
    gst_percent: number;
  }[] = [];

  for (const t of individualTests ?? []) {
    items.push({ order_id: order.id, test_id: t.id, test_name: t.name, reference_range: t.reference_range, unit: t.unit, price: Number(t.price), gst_percent: Number(t.gst_percent) });
  }
  for (const pkg of packages ?? []) {
    const testsInPkg = Array.isArray(pkg.lab_package_tests) ? pkg.lab_package_tests : [];
    const perTestPrice = testsInPkg.length > 0 ? round2(Number(pkg.price) / testsInPkg.length) : Number(pkg.price);
    for (const pt of testsInPkg) {
      const test = Array.isArray(pt.lab_tests) ? pt.lab_tests[0] : (pt.lab_tests as { name: string; reference_range: string | null; unit: string | null } | null);
      items.push({
        order_id: order.id,
        test_id: pt.test_id,
        test_name: test?.name ?? "Test",
        reference_range: test?.reference_range ?? null,
        unit: test?.unit ?? null,
        price: perTestPrice,
        gst_percent: Number(pkg.gst_percent),
      });
    }
  }

  if (items.length > 0) {
    const { error: itemsError } = await admin.from("lab_order_items").insert(items);
    if (itemsError) {
      await admin.from("lab_orders").delete().eq("id", order.id);
      return { error: "Could not save order items" };
    }
  }

  revalidatePath("/lab/orders");
  return { orderId: order.id };
}

export async function updateLabOrderStatusAction(
  orderId: string,
  status: "booked" | "sample_collected" | "received_at_lab" | "processing" | "report_ready" | "delivered" | "cancelled",
): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("lab_orders").update({ status }).eq("id", orderId).eq("shop_id", session.shopId);
  if (error) return { error: "Could not update order" };
  revalidatePath("/lab/orders");
  revalidatePath(`/lab/orders/${orderId}`);
  return {};
}

/** Enters the measured result and compares it to the stated reference
 * range — plain arithmetic (is the number inside or outside the stated
 * bounds), same as any printed lab report shows. No interpretation of
 * what a flagged result MEANS is generated. */
export async function saveTestResultAction(itemId: string, resultValue: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: item } = await admin.from("lab_order_items").select("id, reference_range, order_id, lab_orders!inner(shop_id)").eq("id", itemId).single();
  if (!item) return { error: "Test item not found" };
  const order = Array.isArray(item.lab_orders) ? item.lab_orders[0] : item.lab_orders;
  if (order?.shop_id !== session.shopId) return { error: "Test item not found" };

  let flag: "normal" | "high" | "low" | null = null;
  const numericValue = Number(resultValue);
  if (item.reference_range && !Number.isNaN(numericValue)) {
    const match = item.reference_range.match(/([\d.]+)\s*-\s*([\d.]+)/);
    if (match) {
      const low = Number(match[1]);
      const high = Number(match[2]);
      if (numericValue < low) flag = "low";
      else if (numericValue > high) flag = "high";
      else flag = "normal";
    }
  }

  const { error } = await admin.from("lab_order_items").update({ result_value: resultValue, result_flag: flag }).eq("id", itemId);
  if (error) return { error: "Could not save result" };
  revalidatePath(`/lab/orders/${item.order_id}`);
  return {};
}

/** Once all results are in and marked report_ready, generate the bill —
 * same as any other business type, through the shared GST billing core. */
export async function billLabOrderAction(orderId: string, paymentMethod: "cash" | "card" | "upi" | "online" | "other", paidAmount: number): Promise<{ error?: string; billId?: string }> {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();

  const { data: order } = await admin.from("lab_orders").select("id, patient_id, patient_name, bill_id").eq("id", orderId).eq("shop_id", session.shopId).single();
  if (!order) return { error: "Order not found" };
  if (order.bill_id) return { error: "This order is already billed" };

  const { data: items } = await admin.from("lab_order_items").select("test_name, price, gst_percent").eq("order_id", orderId);
  if (!items || items.length === 0) return { error: "No tests on this order" };

  let customerId = order.patient_id;
  if (!customerId) {
    const { data: newCustomer } = await admin.from("customers").insert({ shop_id: session.shopId, name: order.patient_name, phone: "" }).select("id").single();
    customerId = newCustomer?.id ?? null;
  }

  const { createBillCore } = await import("./bills");
  const result = await createBillCore(session, {
    customerId,
    items: items.map((i) => ({ productId: null, description: i.test_name, hsnCode: null, quantity: 1, unitPrice: Number(i.price), gstPercent: Number(i.gst_percent) })),
    discountType: "flat",
    discountValue: 0,
    paidAmount,
    paymentMethod,
  });
  if ("error" in result) return { error: result.error };

  const { error: linkError } = await admin.from("lab_orders").update({ bill_id: result.billId }).eq("id", orderId).eq("shop_id", session.shopId);
  if (linkError) {
    // If the order can't be linked to this bill, a retry would create a
    // SECOND bill for the same order (the "already billed" guard above
    // checks order.bill_id, which never got set). Void this one rather
    // than risk a duplicate invoice for the same tests.
    console.error("Could not link bill to lab order", linkError);
    await admin
      .from("bills")
      .update({ status: "voided", voided_at: new Date().toISOString(), void_reason: "Automatic: could not link invoice to lab order" })
      .eq("id", result.billId);
    return { error: "Could not finish billing this order — the invoice was voided automatically. Please try again." };
  }
  revalidatePath(`/lab/orders/${orderId}`);
  return { billId: result.billId };
}
