import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { formatDateTime } from "@/lib/format";
import {
  Trash2, Pencil, UserPlus, UserMinus, KeyRound, Activity, Lock, Unlock, PiggyBank, Wallet, FileMinus, Upload, PackageCheck, ShieldAlert, BedDouble, ChevronDown,
} from "lucide-react";
import { isModuleEnabled } from "@/lib/modules";
import { ModuleBlocked } from "@/app/components/ModuleBlocked";
import { History } from "lucide-react";
import { getTranslator } from "@/lib/i18n/server";
import { BackLink } from "@/app/components/BackLink";
import { FIELD_LABELS, SENSITIVE_FIELDS, type ItemSnapshot } from "@/lib/auditChanges";

type Info = { icon: typeof Trash2; label: string; tone: string; group: Group };
type Group = "items" | "stock" | "bills" | "staff" | "money" | "security" | "other";

const ACTION_INFO: Record<string, Info> = {
  bill_voided: { icon: Trash2, label: "Bill voided", tone: "text-danger", group: "bills" },
  bill_quantities_edited: { icon: Pencil, label: "Bill quantities edited", tone: "text-warning", group: "bills" },
  staff_added: { icon: UserPlus, label: "Staff added", tone: "text-success", group: "staff" },
  staff_removed: { icon: UserMinus, label: "Staff removed", tone: "text-danger", group: "staff" },
  staff_permissions_changed: { icon: KeyRound, label: "Staff permissions changed", tone: "text-info", group: "staff" },
  day_closed: { icon: Lock, label: "Day closed", tone: "text-foreground", group: "money" },
  day_reopened: { icon: Unlock, label: "Day reopened", tone: "text-warning", group: "money" },
  gold_scheme_closed: { icon: PiggyBank, label: "Gold scheme closed", tone: "text-danger", group: "money" },
  wallet_refunded: { icon: Wallet, label: "Prepaid balance handed back", tone: "text-danger", group: "money" },
  worker_payment_removed: { icon: Trash2, label: "Staff payment removed", tone: "text-danger", group: "money" },
  debit_note_issued: { icon: FileMinus, label: "Debit note issued", tone: "text-info", group: "money" },
  hotel_booking_created: { icon: BedDouble, label: "Booking made", tone: "text-foreground", group: "other" },
  hotel_check_in: { icon: BedDouble, label: "Guest checked in", tone: "text-foreground", group: "other" },
  hotel_check_out: { icon: BedDouble, label: "Guest checked out", tone: "text-foreground", group: "other" },
  product_updated: { icon: Pencil, label: "Item edited", tone: "text-warning", group: "items" },
  product_deleted: { icon: Trash2, label: "Item deleted", tone: "text-danger", group: "items" },
  product_force_deleted: { icon: Trash2, label: "Item deleted with its history", tone: "text-danger", group: "items" },
  products_deleted: { icon: Trash2, label: "Items deleted together", tone: "text-danger", group: "items" },
  products_imported: { icon: Upload, label: "Items imported from Excel", tone: "text-info", group: "items" },
  stock_count_applied: { icon: PackageCheck, label: "Stock count applied", tone: "text-warning", group: "stock" },
  manager_pin_wrong: { icon: ShieldAlert, label: "Wrong manager PIN tried", tone: "text-danger", group: "security" },
};

const GROUPS: { key: Group | "all" | "check"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "check", label: "Needs a look" },
  { key: "items", label: "Items" },
  { key: "stock", label: "Stock" },
  { key: "bills", label: "Bills" },
  { key: "money", label: "Money" },
  { key: "staff", label: "Staff" },
  { key: "security", label: "PIN" },
];

const money = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const qty = (v: unknown, unit?: unknown) => `${Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })}${unit ? ` ${String(unit).toLowerCase()}` : ""}`;

type Details = Record<string, unknown>;
type Changes = Record<string, [unknown, unknown]>;
type Ctx = { categoryName: Map<string, string>; bill: Map<string, { invoice: string; total: number; buyer: string | null }>; billLine: Map<string, { name: string; quantity: number }> };

function fieldValue(col: string, v: unknown, ctx: Ctx): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (col === "category_id") return ctx.categoryName.get(String(v)) ?? "(category removed)";
  if (["price", "mrp", "offer_price", "bulk_price", "wholesale_price", "security_deposit", "making_charge_value"].includes(col) || col.startsWith("rental_rate")) return money(v);
  return String(v);
}

/** Why an entry deserves a second look — shown as a red tag, and what "Needs a look" filters on. */
function concern(action: string, d: Details | null): string | null {
  if (action === "manager_pin_wrong") return "Someone tried a wrong PIN";
  if (action === "bill_voided") return "Money taken off the books";
  if (action === "bill_quantities_edited") return "Bill changed after billing";
  if (action === "products_deleted" || action === "product_force_deleted") return "Items removed";
  if (action === "product_deleted") {
    const it = (d?.items as ItemSnapshot[] | undefined)?.[0];
    return it && it.tracked && it.stock > 0 ? "Deleted with stock in hand" : null;
  }
  if (action === "product_updated") {
    const c = (d?.changes ?? {}) as Changes;
    if (c.stock_quantity) {
      const [b, a] = c.stock_quantity.map(Number);
      return a < b ? `Stock lowered by ${qty(b - a)}` : "Stock typed over";
    }
    if (c.price && Number(c.price[1]) < Number(c.price[0])) return "Price lowered";
    return null;
  }
  if (action === "stock_count_applied") {
    const short = ((d?.items ?? []) as { system: number; counted: number }[]).filter((i) => i.counted < i.system).length;
    return short ? `${short} item(s) short in the count` : null;
  }
  if (action === "day_closed" && Math.abs(Number(d?.difference ?? 0)) >= 1) return "Cash didn't match";
  return null;
}

/** The one-line summary under the title. */
function summary(action: string, d: Details | null, ctx: Ctx, entityId: string | null): string {
  if (!d) return "";
  const items = (d.items ?? []) as ItemSnapshot[];
  const bill = entityId ? ctx.bill.get(entityId) : undefined;
  switch (action) {
    case "bill_voided":
      return `${bill ? `${bill.invoice} · ${money(bill.total)} · ` : ""}Reason: ${d.reason}`;
    case "bill_quantities_edited":
      return `${bill ? `${bill.invoice} · ` : ""}Reason: ${d.reason}`;
    case "staff_added":
    case "staff_removed":
      return `${d.name} (${d.role})`;
    case "day_closed":
      return `${d.date}: counted ${money(d.counted)}, difference ${money(d.difference)}`;
    case "day_reopened":
      return `${d.date} (had counted ${money(d.counted)})`;
    case "gold_scheme_closed":
      return `Paid in ${money(d.paid)}, handed back ${money(d.refund)}`;
    case "wallet_refunded":
      return `Balance ${money(d.balance)}, handed back ${money(d.handedBack)}`;
    case "worker_payment_removed":
      return `${d.kind} ${money(d.amount)} (${d.month})`;
    case "debit_note_issued":
      return `${d.noteNumber}: ${money(d.total)}`;
    case "staff_permissions_changed": {
      const before = Array.isArray(d.before) ? d.before : [];
      const after = Array.isArray(d.after) ? d.after : [];
      return `${d.staffName}: ${before.length} → ${after.length} permissions`;
    }
    case "product_updated": {
      const c = Object.keys((d.changes ?? {}) as Changes);
      return `${d.name} — ${c.map((k) => FIELD_LABELS[k] ?? k).join(", ")}`;
    }
    case "product_deleted":
    case "product_force_deleted":
      return items[0] ? `${items[0].name} · ${money(items[0].price)}${items[0].tracked ? ` · stock ${qty(items[0].stock, items[0].unit)}` : ""}` : "";
    case "products_deleted":
      return `${d.count} item(s)${d.source === "import" ? " from an import" : ""} · stock in hand ${qty(items.reduce((s, i) => s + (i.tracked ? i.stock : 0), 0))} · value ${money(items.reduce((s, i) => s + (i.tracked ? i.stock * i.price : 0), 0))}`;
    case "products_imported":
      return `${d.inserted} new, ${d.updated ?? 0} updated${d.failedRows ? `, ${d.failedRows} row(s) not saved` : ""}`;
    case "stock_count_applied":
      return `${((d.items ?? []) as unknown[]).length} item(s) changed`;
    case "manager_pin_wrong":
      return `While trying to ${d.tried}`;
    default:
      return "";
  }
}

function ItemsTable({ items }: { items: ItemSnapshot[] }) {
  return (
    <table className="w-full text-left text-[11px]">
      <thead className="text-muted">
        <tr>
          <th className="py-1 font-medium">Item</th>
          <th className="py-1 text-right font-medium">Price</th>
          <th className="py-1 text-right font-medium">MRP</th>
          <th className="py-1 text-right font-medium">Stock</th>
        </tr>
      </thead>
      <tbody>
        {items.map((i, n) => (
          <tr key={n} className="border-t border-border">
            <td className="py-1 pr-2">
              {i.name}
              {i.barcode ? <span className="block text-muted">{i.barcode}</span> : null}
            </td>
            <td className="py-1 text-right">{money(i.price)}</td>
            <td className="py-1 text-right">{money(i.mrp)}</td>
            <td className="py-1 text-right">{i.tracked ? qty(i.stock, i.unit) : "not counted"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChangesTable({ changes, ctx }: { changes: Changes; ctx: Ctx }) {
  const cols = Object.keys(changes).sort((a, b) => Number(SENSITIVE_FIELDS.has(b)) - Number(SENSITIVE_FIELDS.has(a)));
  return (
    <table className="w-full text-left text-[11px]">
      <thead className="text-muted">
        <tr>
          <th className="py-1 font-medium">Field</th>
          <th className="py-1 font-medium">Before</th>
          <th className="py-1 font-medium">After</th>
        </tr>
      </thead>
      <tbody>
        {cols.map((c) => (
          <tr key={c} className={`border-t border-border ${SENSITIVE_FIELDS.has(c) ? "font-semibold text-foreground" : ""}`}>
            <td className="py-1 pr-2">{FIELD_LABELS[c] ?? c}</td>
            <td className="py-1 pr-2 text-muted line-through decoration-danger/50">{fieldValue(c, changes[c][0], ctx)}</td>
            <td className="py-1">{fieldValue(c, changes[c][1], ctx)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Everything the entry holds, laid out for its kind; anything unknown is listed as it is. */
function Body({ action, d, ctx }: { action: string; d: Details; ctx: Ctx }) {
  const items = (d.items ?? []) as ItemSnapshot[];
  if (action === "product_updated") return <ChangesTable changes={(d.changes ?? {}) as Changes} ctx={ctx} />;
  if (["product_deleted", "product_force_deleted", "products_deleted"].includes(action)) return <ItemsTable items={items} />;
  if (action === "products_imported") {
    const added = (d.items ?? []) as { name: string; price: number | null; stock: number }[];
    const changed = (d.changed ?? []) as { name: string; changes: Changes }[];
    return (
      <div className="flex flex-col gap-2">
        {added.length > 0 && (
          <div>
            <p className="mb-1 font-medium text-foreground">New items ({added.length})</p>
            <ul className="max-h-48 overflow-y-auto">
              {added.map((a, i) => (
                <li key={i} className="flex justify-between border-t border-border py-0.5">
                  <span>{a.name}</span>
                  <span>
                    {money(a.price)} · stock {qty(a.stock)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {changed.map((c, i) => (
          <div key={i}>
            <p className="mb-0.5 font-medium text-foreground">{c.name}</p>
            <ChangesTable changes={c.changes} ctx={ctx} />
          </div>
        ))}
      </div>
    );
  }
  if (action === "stock_count_applied") {
    const rows = (d.items ?? []) as { name: string; unit: string; system: number; counted: number }[];
    return (
      <table className="w-full text-left text-[11px]">
        <thead className="text-muted">
          <tr>
            <th className="py-1 font-medium">Item</th>
            <th className="py-1 text-right font-medium">System</th>
            <th className="py-1 text-right font-medium">Counted</th>
            <th className="py-1 text-right font-medium">Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-1 pr-2">{r.name}</td>
              <td className="py-1 text-right">{qty(r.system, r.unit)}</td>
              <td className="py-1 text-right">{qty(r.counted, r.unit)}</td>
              <td className={`py-1 text-right font-semibold ${r.counted < r.system ? "text-danger" : "text-success"}`}>
                {r.counted - r.system > 0 ? "+" : ""}
                {qty(r.counted - r.system)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (action === "bill_quantities_edited") {
    const rows = (d.changes ?? []) as { billItemId: string; newQuantity: number }[];
    return (
      <ul>
        {rows.map((r, i) => {
          const line = ctx.billLine.get(r.billItemId);
          return (
            <li key={i} className="flex justify-between border-t border-border py-0.5">
              <span>{line?.name ?? "Item"}</span>
              <span>changed to {qty(r.newQuantity)}</span>
            </li>
          );
        })}
      </ul>
    );
  }
  if (action === "staff_permissions_changed") {
    const before = new Set(Array.isArray(d.before) ? (d.before as string[]) : []);
    const after = new Set(Array.isArray(d.after) ? (d.after as string[]) : []);
    const added = [...after].filter((p) => !before.has(p));
    const removed = [...before].filter((p) => !after.has(p));
    return (
      <div className="flex flex-col gap-0.5">
        {added.length > 0 && <p className="text-success">Given: {added.join(", ").replace(/_/g, " ")}</p>}
        {removed.length > 0 && <p className="text-danger">Taken away: {removed.join(", ").replace(/_/g, " ")}</p>}
      </div>
    );
  }
  const rest = Object.entries(d).filter(([k]) => !k.startsWith("_"));
  if (!rest.length) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
      {rest.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}</dt>
          <dd className="break-words">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<{ type?: string; before?: string }> }) {
  const { t } = await getTranslator();
  const session = await requireOwner();
  if (!isModuleEnabled(session.enabledModules, "audit_log")) return <ModuleBlocked moduleKey="audit_log" />;
  const { type = "all", before } = await searchParams;
  const admin = createSupabaseAdminClient();

  const actionsOf = (g: string) => Object.entries(ACTION_INFO).filter(([, i]) => i.group === g).map(([a]) => a);
  let query = admin
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, details, created_at, staff_id, staff:staff_id ( name, role )")
    .eq("shop_id", session.shopId)
    .order("created_at", { ascending: false })
    .limit(150);
  if (type !== "all" && type !== "check") query = query.in("action", actionsOf(type));
  if (before && !Number.isNaN(Date.parse(before))) query = query.lt("created_at", before);
  const { data: raw } = await query;
  const logs = (raw ?? []).filter((l) => type !== "check" || concern(l.action, l.details as Details | null));

  // Names behind the ids the entries keep: categories on item edits, bills and their lines.
  const categoryIds = new Set<string>();
  const billIds = new Set<string>();
  const lineIds = new Set<string>();
  for (const l of logs) {
    const d = (l.details ?? {}) as Details;
    if (l.action === "product_updated") {
      const c = (d.changes ?? {}) as Changes;
      for (const v of c.category_id ?? []) if (typeof v === "string") categoryIds.add(v);
    }
    if (l.action === "products_imported") for (const ch of (d.changed ?? []) as { changes: Changes }[]) for (const v of ch.changes.category_id ?? []) if (typeof v === "string") categoryIds.add(v);
    if (l.entity_type === "bill" && l.entity_id) billIds.add(l.entity_id);
    if (l.action === "bill_quantities_edited") for (const r of (d.changes ?? []) as { billItemId: string }[]) lineIds.add(r.billItemId);
  }
  const [cats, bills, lines] = await Promise.all([
    categoryIds.size ? admin.from("categories").select("id, name").in("id", [...categoryIds]) : Promise.resolve({ data: [] }),
    billIds.size ? admin.from("bills").select("id, invoice_number, total, buyer_name").eq("shop_id", session.shopId).in("id", [...billIds]) : Promise.resolve({ data: [] }),
    lineIds.size ? admin.from("bill_items").select("id, product_name, quantity").in("id", [...lineIds]) : Promise.resolve({ data: [] }),
  ]);
  const ctx: Ctx = {
    categoryName: new Map((cats.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name])),
    bill: new Map((bills.data ?? []).map((b: { id: string; invoice_number: string; total: number; buyer_name: string | null }) => [b.id, { invoice: b.invoice_number, total: Number(b.total), buyer: b.buyer_name }])),
    billLine: new Map((lines.data ?? []).map((r: { id: string; product_name: string; quantity: number }) => [r.id, { name: r.product_name, quantity: Number(r.quantity) }])),
  };
  const older = (raw ?? []).length === 150 ? raw![raw!.length - 1].created_at : null;

  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/dashboard" />
      <PageHeader
        title={t("Audit log")}
        subtitle="Who did what, when, from which phone — tap an entry for the full detail."
        icon={<History size={18} strokeWidth={1.8} />}
      />

      <div className="-mx-4 flex gap-2 overflow-x-auto scroll-hide px-4 pb-1">
        {GROUPS.map((g) => (
          <Link
            key={g.key}
            href={g.key === "all" ? "/audit-log" : `/audit-log?type=${g.key}`}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${type === g.key ? "border-brand bg-brand-soft text-brand-text" : "border-border bg-surface text-foreground"}`}
          >
            {g.label}
          </Link>
        ))}
      </div>

      {logs.length === 0 ? (
        <EmptyState text={type === "check" ? "Nothing that needs a look in the latest entries." : "Nothing recorded yet."} />
      ) : (
        <ul className="flex flex-col gap-2">
          {logs.map((log) => {
            const staff = Array.isArray(log.staff) ? log.staff[0] : (log.staff as { name: string; role: string } | null);
            const d = (log.details ?? null) as Details | null;
            const by = (d?._by ?? null) as { name?: string; role?: string } | null;
            const who = by?.name ?? staff?.name ?? (log.staff_id === session.userId ? session.staffName : "Owner");
            const role = by?.role ?? staff?.role ?? null;
            const info = ACTION_INFO[log.action];
            const Icon = info?.icon ?? Activity;
            const flag = concern(log.action, d);
            const line = summary(log.action, d, ctx, log.entity_id);
            return (
              <li key={log.id} className={`rounded-lg border bg-surface shadow-sm ${flag ? "border-danger/40" : "border-border"}`}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-col gap-0.5 px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`flex min-w-0 items-center gap-1.5 text-sm font-medium ${info?.tone ?? "text-foreground"}`}>
                        <Icon size={14} className="shrink-0" /> <span className="truncate">{info?.label ?? log.action.replace(/_/g, " ")}</span>
                      </p>
                      <p className="flex shrink-0 items-center gap-1 text-[11px] text-muted">
                        {formatDateTime(log.created_at)} <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                      </p>
                    </div>
                    <p className="text-xs text-muted">
                      <span className="font-medium text-foreground">{who}</span>
                      {role ? ` (${role})` : ""}
                      {line ? ` — ${line}` : ""}
                    </p>
                    {flag && <span className="mt-0.5 self-start rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger">{flag}</span>}
                  </summary>
                  <div className="flex flex-col gap-2 border-t border-border px-3.5 py-2.5 text-xs text-foreground">
                    {d && <Body action={log.action} d={d} ctx={ctx} />}
                    <div className="flex flex-col gap-0.5 text-[11px] text-muted">
                      <p>
                        By {who}
                        {role ? ` (${role})` : ""} · {new Date(log.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Kolkata" })}
                      </p>
                      {typeof d?._device === "string" && <p>Device: {d._device}</p>}
                      {typeof d?._ip === "string" && <p>Internet address: {d._ip}</p>}
                      {d?.pinUsed === true && <p>Manager PIN was given for this.</p>}
                      {log.entity_type === "bill" && log.entity_id && (
                        <Link href={`/print/bill/${log.entity_id}`} className="font-medium text-brand-text underline">
                          Open the bill{ctx.bill.get(log.entity_id)?.buyer ? ` (${ctx.bill.get(log.entity_id)?.buyer})` : ""}
                        </Link>
                      )}
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      {older && (
        <Link href={`/audit-log?${new URLSearchParams({ ...(type !== "all" ? { type } : {}), before: older }).toString()}`} className="self-center text-xs font-medium text-brand-text underline">
          Older entries
        </Link>
      )}
    </div>
  );
}
