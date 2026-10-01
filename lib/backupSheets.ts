/** What a shop's full backup holds: one sheet per table, its own business data only (no counters,
 * settings plumbing, system logs or The Ray's dealings with the shop). Tables that carry shop_id
 * are read by shop; item tables are read through their parent's ids. Order = the order of sheets,
 * so the everyday ones come first; empty tables are left out of the file. */
export type BackupTable = { table: string; sheet: string; parent?: { table: string; key: string }; order?: string };

export const BACKUP_TABLES: BackupTable[] = [
  { table: "customers", sheet: "Customers" },
  { table: "products", sheet: "Items" },
  { table: "categories", sheet: "Categories" },
  { table: "bills", sheet: "Bills" },
  { table: "bill_items", sheet: "Bill items", parent: { table: "bills", key: "bill_id" } },
  { table: "payments", sheet: "Payments received" },
  { table: "returns", sheet: "Returns" },
  { table: "return_items", sheet: "Return items", parent: { table: "returns", key: "return_id" } },
  { table: "debit_notes", sheet: "Debit notes" },
  { table: "quotations", sheet: "Quotations & orders" },
  { table: "delivery_challans", sheet: "Delivery challans" },
  { table: "vendors", sheet: "Vendors" },
  { table: "purchases", sheet: "Purchases" },
  { table: "purchase_items", sheet: "Purchase items", parent: { table: "purchases", key: "purchase_id" } },
  { table: "purchase_payments", sheet: "Vendor payments" },
  { table: "petty_cash_entries", sheet: "Petty cash" },
  { table: "cash_movements", sheet: "Cash in & out" },
  { table: "day_closes", sheet: "Day close" },
  { table: "stock_audits", sheet: "Stock audits" },
  { table: "stock_audit_items", sheet: "Stock audit items", parent: { table: "stock_audits", key: "audit_id" } },
  { table: "medicine_batches", sheet: "Medicine batches" },
  { table: "batch_writeoffs", sheet: "Write-offs" },
  { table: "staff", sheet: "Staff" },
  { table: "branches", sheet: "Branches" },
  { table: "workers", sheet: "Workers" },
  { table: "worker_attendance", sheet: "Worker attendance" },
  { table: "worker_payments", sheet: "Worker payments" },
  { table: "wallet_entries", sheet: "Prepaid balance" },
  { table: "customer_packages", sheet: "Customer packages" },
  { table: "package_uses", sheet: "Package uses" },
  { table: "combos", sheet: "Combos" },
  { table: "combo_items", sheet: "Combo items", parent: { table: "combos", key: "combo_id" } },
  { table: "product_option_groups", sheet: "Item options" },
  { table: "product_option_choices", sheet: "Item option choices", parent: { table: "product_option_groups", key: "group_id" } },
  { table: "restaurant_tables", sheet: "Tables" },
  { table: "restaurant_orders", sheet: "Restaurant orders" },
  { table: "restaurant_order_items", sheet: "Restaurant order items", parent: { table: "restaurant_orders", key: "order_id" } },
  { table: "restaurant_order_payments", sheet: "Restaurant payments", parent: { table: "restaurant_orders", key: "order_id" } },
  { table: "restaurant_reservations", sheet: "Reservations" },
  { table: "table_order_requests", sheet: "QR table orders" },
  { table: "table_order_request_items", sheet: "QR table order items", parent: { table: "table_order_requests", key: "request_id" } },
  { table: "recipe_lines", sheet: "Recipes" },
  { table: "kitchen_usage", sheet: "Kitchen usage" },
  { table: "catalog_order_requests", sheet: "Online orders" },
  { table: "catalog_order_request_items", sheet: "Online order items", parent: { table: "catalog_order_requests", key: "request_id" } },
  { table: "hotel_room_types", sheet: "Room types" },
  { table: "hotel_rooms", sheet: "Rooms" },
  { table: "hotel_bookings", sheet: "Hotel bookings" },
  { table: "hotel_booking_rooms", sheet: "Booking rooms" },
  { table: "hotel_charges", sheet: "Hotel charges" },
  { table: "hotel_payments", sheet: "Hotel payments" },
  { table: "rentals", sheet: "Rentals" },
  { table: "rental_items", sheet: "Rental items", parent: { table: "rentals", key: "rental_id" } },
  { table: "vehicles", sheet: "Vehicles" },
  { table: "transport_trips", sheet: "Trips" },
  { table: "consignments", sheet: "Bilty" },
  { table: "trip_expenses", sheet: "Trip expenses" },
  { table: "service_jobs", sheet: "Repair jobs" },
  { table: "service_job_items", sheet: "Repair job items", parent: { table: "service_jobs", key: "job_id" } },
  { table: "service_job_parts", sheet: "Repair job parts", parent: { table: "service_jobs", key: "job_id" } },
  { table: "appointments", sheet: "Appointments" },
  { table: "jewellery_exchanges", sheet: "Old gold exchanges" },
  { table: "metal_rates", sheet: "Gold & silver rates" },
  { table: "gold_schemes", sheet: "Gold schemes" },
  { table: "gold_scheme_payments", sheet: "Gold scheme payments" },
  { table: "karigar_jobs", sheet: "Karigar register" },
  { table: "clinic_appointments", sheet: "Clinic appointments" },
  { table: "prescriptions", sheet: "Prescriptions" },
  { table: "prescription_items", sheet: "Prescription medicines", parent: { table: "prescriptions", key: "prescription_id" } },
  { table: "prescription_templates", sheet: "Prescription templates" },
  { table: "prescription_quick_phrases", sheet: "Quick phrases" },
  { table: "treatment_plans", sheet: "Treatment plans" },
  { table: "treatment_plan_items", sheet: "Treatment plan steps", parent: { table: "treatment_plans", key: "treatment_plan_id" } },
  { table: "shop_medicine_library", sheet: "Medicine library" },
  { table: "patient_photos", sheet: "Patient photos" },
  { table: "lab_tests", sheet: "Lab tests" },
  { table: "lab_packages", sheet: "Lab packages" },
  { table: "lab_package_tests", sheet: "Lab package tests", parent: { table: "lab_packages", key: "package_id" } },
  { table: "lab_orders", sheet: "Lab orders" },
  { table: "lab_order_items", sheet: "Lab order tests", parent: { table: "lab_orders", key: "order_id" } },
  { table: "membership_plans", sheet: "Membership plans" },
  { table: "memberships", sheet: "Memberships" },
  { table: "gym_attendance", sheet: "Gym attendance" },
  { table: "gym_classes", sheet: "Gym classes" },
  { table: "gym_class_bookings", sheet: "Class bookings", parent: { table: "gym_classes", key: "class_id" } },
  { table: "leads", sheet: "Leads" },
  { table: "workout_plans", sheet: "Workout plans" },
  { table: "workout_exercises", sheet: "Workout exercises", parent: { table: "workout_plans", key: "plan_id" } },
  { table: "diet_plans", sheet: "Diet plans" },
  { table: "diet_meals", sheet: "Diet meals", parent: { table: "diet_plans", key: "plan_id" } },
  { table: "progress_logs", sheet: "Progress logs" },
  { table: "growth_logs", sheet: "Growth logs" },
  { table: "item_requests", sheet: "Item requests" },
  { table: "festival_notes", sheet: "Festival notes", order: "festival_slug" },
  { table: "audit_logs", sheet: "Activity log" },
];

/** Shop columns worth keeping in the backup (not PINs or The Ray's plan bookkeeping). */
export const SHOP_FIELDS = ["name", "legal_name", "gstin", "address_line1", "address_line2", "city", "state", "state_code", "pincode", "gst_scheme", "invoice_prefix", "upi_id", "owner_phone", "business_type", "created_at"] as const;

/** Never written to the file, whatever table they turn up in. */
const DROP = new Set(["shop_id", "manager_pin", "pin_hash", "password_hash"]);

/** Excel cells hold at most 32,767 characters. */
const CELL_MAX = 32000;

/** A database row as a flat spreadsheet row: nested values become JSON text, long text is cut. */
export function flattenRow(row: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(row)) {
    if (DROP.has(k)) continue;
    let cell: string | number | boolean | null;
    if (v === null || v === undefined) cell = null;
    else if (typeof v === "number" || typeof v === "boolean") cell = v;
    else if (typeof v === "string") cell = v;
    else cell = JSON.stringify(v);
    if (typeof cell === "string" && cell.length > CELL_MAX) cell = cell.slice(0, CELL_MAX) + "…";
    out[k] = cell;
  }
  return out;
}

/** A sheet name Excel accepts (≤31 characters, none of : \ / ? * [ ]) and not already used. */
export function sheetName(wanted: string, used: Set<string>): string {
  const base = wanted.replace(/[:\\/?*[\]]/g, "-").slice(0, 31) || "Sheet";
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 28)} ${n}`;
  used.add(name.toLowerCase());
  return name;
}

/** Every table's parent must come before it, so its ids are known when the items are read. */
export function parentsFirst(tables: BackupTable[]): boolean {
  const seen = new Set<string>();
  for (const t of tables) {
    if (t.parent && !seen.has(t.parent.table)) return false;
    seen.add(t.table);
  }
  return true;
}
