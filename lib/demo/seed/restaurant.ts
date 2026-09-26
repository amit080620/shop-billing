import {
  addOrderItemAction,
  createNumberedTablesAction,
  createTableAction,
  markItemReadyAction,
  markItemServedAction,
  setWaiterAction,
  settleOrderAction,
  startOrderAction,
  saveKdsSettingsAction,
  type SettlePayment,
} from "@/lib/actions/restaurant";
import { createComboAction } from "@/lib/actions/combos";
import { createOptionChoiceAction, createOptionGroupAction } from "@/lib/actions/product-options";
import { createReservationAction } from "@/lib/actions/reservations";
import { dateOffset, fakePhone, formData, isoAt, personName } from "../util";
import type { Catalog } from "./catalogs";
import { enableCatalog, insertCatalog, insertVendors, seedPettyCash, seedPurchases, STANDARD_PETTY_CASH, type SeedCtx, type SeededProduct } from "./common";

export const RESTAURANT_MENU: Catalog = [
  {
    category: "Starters",
    items: [
      { name: "Paneer Tikka", price: 240, gst: 5, unit: "PLATE", stock: 0 },
      { name: "Veg Manchurian Dry", price: 190, gst: 5, unit: "PLATE", stock: 0 },
      { name: "Chicken 65", price: 260, gst: 5, unit: "PLATE", stock: 0 },
      { name: "Crispy Corn", price: 170, gst: 5, unit: "PLATE", stock: 0 },
    ],
  },
  {
    category: "Main Course",
    items: [
      { name: "Paneer Butter Masala", price: 280, gst: 5, unit: "PLATE", stock: 0 },
      { name: "Dal Makhani", price: 230, gst: 5, unit: "PLATE", stock: 0 },
      { name: "Butter Chicken", price: 340, gst: 5, unit: "PLATE", stock: 0 },
      { name: "Veg Kolhapuri", price: 220, gst: 5, unit: "PLATE", stock: 0 },
    ],
  },
  {
    category: "Breads",
    items: [
      { name: "Butter Naan", price: 45, gst: 5, unit: "NOS", stock: 0 },
      { name: "Tandoori Roti", price: 25, gst: 5, unit: "NOS", stock: 0 },
      { name: "Garlic Naan", price: 65, gst: 5, unit: "NOS", stock: 0 },
    ],
  },
  {
    category: "Rice & Biryani",
    items: [
      { name: "Veg Biryani", price: 240, gst: 5, unit: "PLATE", stock: 0 },
      { name: "Chicken Biryani", price: 320, gst: 5, unit: "PLATE", stock: 0 },
      { name: "Jeera Rice", price: 160, gst: 5, unit: "PLATE", stock: 0 },
    ],
  },
  {
    category: "Beverages",
    items: [
      { name: "Masala Chai", price: 30, gst: 5, unit: "GLASS", stock: 0 },
      { name: "Fresh Lime Soda", price: 70, gst: 5, unit: "GLASS", stock: 0 },
      { name: "Cold Coffee", price: 120, gst: 5, unit: "GLASS", stock: 0 },
      { name: "Mango Lassi", price: 90, gst: 5, unit: "GLASS", stock: 0 },
    ],
  },
  {
    category: "Desserts",
    items: [
      { name: "Gulab Jamun (2 pc)", price: 80, gst: 5, unit: "PLATE", stock: 0 },
      { name: "Brownie with Ice Cream", price: 160, gst: 5, unit: "PLATE", stock: 0 },
      { name: "Kulfi Falooda", price: 110, gst: 5, unit: "PLATE", stock: 0 },
    ],
  },
];

async function tableIds(ctx: SeedCtx): Promise<{ id: string; name: string }[]> {
  const { data } = await ctx.admin.from("restaurant_tables").select("id, name").eq("shop_id", ctx.shopId).eq("is_deleted", false).is("hotel_room_id", null);
  return (data ?? []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** Takes an order on a table the way the Tables screen does. Returns the order id. */
export async function takeOrder(ctx: SeedCtx, tableId: string, lines: { product: SeededProduct; qty: number }[], guest?: { name: string; phone: string }): Promise<string> {
  const started = await startOrderAction(tableId, guest?.name, guest?.phone);
  if (started.error || !started.orderId) throw new Error(`demo: start order: ${started.error}`);
  for (const line of lines) {
    const added = await addOrderItemAction(started.orderId, line.product.id, line.qty);
    if (added.error) throw new Error(`demo: add item: ${added.error}`);
  }
  return started.orderId;
}

export async function seedRestaurant(ctx: SeedCtx): Promise<void> {
  const menu = await insertCatalog(ctx, RESTAURANT_MENU, { track: false });
  const byName = (n: string) => menu.find((m) => m.name === n)!;

  await createNumberedTablesAction(6, "inside");
  await createNumberedTablesAction(3, "outside");
  await createTableAction("Takeaway", "takeaway");
  const tables = await tableIds(ctx);
  const dineTables = tables.filter((t) => t.name !== "Takeaway");

  // Choices on a dish: spice level and add-ons, like the real menu screen.
  const biryani = byName("Chicken Biryani");
  const spice = await createOptionGroupAction(biryani.id, "Spice level", true, false);
  for (const [name, extra] of [["Mild", 0], ["Medium", 0], ["Extra spicy", 0]] as const) await createOptionChoiceAction(spice.groupId!, name, extra);
  const extras = await createOptionGroupAction(biryani.id, "Add-ons", false, true);
  for (const [name, extra] of [["Raita", 25], ["Boiled egg", 20], ["Extra gravy", 30]] as const) await createOptionChoiceAction(extras.groupId!, name, extra);

  await createComboAction("Thali for two", 599, 5, [
    { productId: byName("Paneer Butter Masala").id, productName: "Paneer Butter Masala", quantity: 1 },
    { productId: byName("Dal Makhani").id, productName: "Dal Makhani", quantity: 1 },
    { productId: byName("Butter Naan").id, productName: "Butter Naan", quantity: 4 },
    { productId: byName("Gulab Jamun (2 pc)").id, productName: "Gulab Jamun (2 pc)", quantity: 2 },
  ]);
  await createComboAction("Biryani + drink", 349, 5, [
    { productId: byName("Chicken Biryani").id, productName: "Chicken Biryani", quantity: 1 },
    { productId: byName("Masala Chai").id, productName: "Masala Chai", quantity: 1 },
  ]);
  await saveKdsSettingsAction(3, "large");

  // Ingredients and packing, bought from vendors, so Purchases has history.
  const vendors = await insertVendors(ctx, [{ name: "Fresh Farms Vegetables" }, { name: "Sharma Dairy & Paneer" }, { name: "Royal Spices & Masala" }]);
  await seedPurchases(ctx, vendors, menu, [
    { daysAgo: 12, vendorIndex: 0, productIndexes: [0, 1, 2], qty: 10, paidShare: 1 },
    { daysAgo: 5, vendorIndex: 1, productIndexes: [4, 5], qty: 8, paidShare: 0.5 },
  ]);

  // Three weeks of settled orders, lunch and dinner peaks.
  const guests = Array.from({ length: 12 }, (_, i) => ({ name: personName(ctx.random), phone: fakePhone(i + 1) }));
  const orderTimes: { orderId: string; daysAgo: number; hour: number; minute: number }[] = [];
  const total = 46;
  for (let i = 0; i < total; i++) {
    const daysAgo = Math.round(((total - 1 - i) / (total - 1)) ** 1.2 * 20) + 1;
    const table = ctx.random.pick(dineTables);
    const lines = ctx.random.shuffle(menu).slice(0, ctx.random.int(2, 5)).map((product) => ({ product, qty: ctx.random.int(1, 3) }));
    const guest = ctx.random.chance(0.4) ? ctx.random.pick(guests) : undefined;
    const orderId = await takeOrder(ctx, table.id, lines, guest);
    const { data: fresh } = await ctx.admin.from("restaurant_orders").select("total").eq("id", orderId).single();
    const bill = Number(fresh?.total ?? 0);
    const roll = ctx.random.next();
    const payments: SettlePayment[] =
      roll < 0.2
        ? [{ method: "cash", amount: Math.round(bill / 2) }, { method: "upi", amount: bill - Math.round(bill / 2) }]
        : [{ method: roll < 0.55 ? "upi" : roll < 0.8 ? "cash" : "card", amount: bill }];
    const settled = await settleOrderAction(orderId, payments, "flat", 0);
    if (settled.error) throw new Error(`demo: settle: ${settled.error}`);
    orderTimes.push({ orderId, daysAgo, hour: ctx.random.pick([13, 13, 14, 20, 20, 21, 21, 22]), minute: ctx.random.int(0, 50) });
  }
  for (const o of orderTimes) {
    const created = new Date(isoAt(o.daysAgo, o.hour, o.minute));
    const at = (mins: number) => new Date(created.getTime() + mins * 60000).toISOString();
    await ctx.admin
      .from("restaurant_orders")
      .update({ created_at: created.toISOString(), first_ready_at: at(14), served_at: at(28), settled_at: at(55) })
      .eq("id", o.orderId);
    await ctx.admin.from("restaurant_order_items").update({ created_at: created.toISOString(), status: "served" }).eq("order_id", o.orderId);
  }

  // Right now: one table just ordered (kitchen is busy), one half ready, one waiting for the bill.
  const now = Date.now();
  const stamp = async (orderId: string, minutesAgo: number) => {
    await ctx.admin.from("restaurant_orders").update({ created_at: new Date(now - minutesAgo * 60000).toISOString() }).eq("id", orderId);
    await ctx.admin.from("restaurant_order_items").update({ created_at: new Date(now - minutesAgo * 60000).toISOString() }).eq("order_id", orderId);
  };
  const t = (n: number) => dineTables[n].id;
  const fresh = await takeOrder(ctx, t(1), [{ product: byName("Paneer Tikka"), qty: 1 }, { product: byName("Veg Biryani"), qty: 2 }, { product: byName("Masala Chai"), qty: 3 }], guests[0]);
  await stamp(fresh, 4);
  await setWaiterAction(fresh, "Ramesh");

  const half = await takeOrder(ctx, t(4), [{ product: byName("Butter Chicken"), qty: 1 }, { product: byName("Garlic Naan"), qty: 3 }, { product: byName("Cold Coffee"), qty: 2 }], guests[1]);
  await stamp(half, 17);
  await setWaiterAction(half, "Suresh");
  const { data: halfItems } = await ctx.admin.from("restaurant_order_items").select("id, product_name").eq("order_id", half);
  for (const item of halfItems ?? []) if (item.product_name !== "Garlic Naan") await markItemReadyAction(item.id);

  const waiting = await takeOrder(ctx, t(6), [{ product: byName("Chicken Biryani"), qty: 2 }, { product: byName("Mango Lassi"), qty: 2 }, { product: byName("Kulfi Falooda"), qty: 2 }]);
  await stamp(waiting, 42);
  const { data: waitingItems } = await ctx.admin.from("restaurant_order_items").select("id").eq("order_id", waiting);
  for (const item of waitingItems ?? []) {
    await markItemReadyAction(item.id);
    await markItemServedAction(item.id, waiting);
  }

  // Bookings for tonight and the next days.
  const reservations = [
    { name: "Aarti Kapoor", phone: fakePhone(30), party: 4, day: 0, time: "20:00", token: 500, table: dineTables[3].id },
    { name: "Farhan Sheikh", phone: fakePhone(31), party: 2, day: 1, time: "13:30", token: 0, table: dineTables[0].id },
    { name: "Birthday - Joshi family", phone: fakePhone(32), party: 8, day: 2, time: "21:00", token: 1000, table: dineTables[5].id },
  ];
  for (const r of reservations) {
    await createReservationAction(
      null,
      formData({ customerName: r.name, customerPhone: r.phone, partySize: r.party, reservationDate: dateOffset(r.day), reservationTime: r.time, tokenAmount: r.token, tableId: r.table, notes: r.day === 2 ? "Birthday cake will be brought by the guest" : "" }),
    );
  }

  await enableCatalog(ctx, "Order online for pickup or delivery", true);
  await seedPettyCash(ctx, [
    { description: "LPG cylinder", amount: 1850, category: "Kitchen", daysAgo: 3 },
    { description: "Vegetables from market", amount: 2200, category: "Kitchen", daysAgo: 1 },
    ...STANDARD_PETTY_CASH.slice(0, 3),
  ]);
}
