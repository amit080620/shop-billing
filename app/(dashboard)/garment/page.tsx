import Link from "@/lib/link";
import { AlertTriangle, ArrowLeftRight, Boxes, CalendarCheck, ClipboardList, FileBarChart, Lock, PackageMinus, PackagePlus, PackageX, RotateCcw, Shirt, Tags, Truck, Warehouse } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { formatMoney } from "@/lib/format";
import { isModuleEnabled } from "@/lib/modules";
import { loadGodowns, loadStockGrid } from "@/lib/garment/data";
import { garmentGate } from "./gate";

/** Garments → Stock: where every size and colour is, what is on the way, and what needs a decision. */
export default async function GarmentHome() {
  const gate = await garmentGate(null);
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const godownsOn = isModuleEnabled(session.enabledModules, "garment_godowns");
  const returnsOn = isModuleEnabled(session.enabledModules, "supplier_returns");

  const [{ count: styleCount }, godowns, { data: purchases }] = await Promise.all([
    admin.from("product_styles").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId),
    loadGodowns(admin, session.shopId),
    admin.from("purchases").select("id, purchase_date, vendor_invoice_number, total, vendors ( name )").eq("shop_id", session.shopId).order("created_at", { ascending: false }).limit(5),
  ]);
  const grid = godownsOn && godowns.length ? await loadStockGrid(admin, session.shopId) : null;
  const [openTransfers, damage, missing, counts] = godownsOn
    ? await Promise.all([
        admin.from("stock_transfers").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId).in("status", ["requested", "approved", "dispatched", "partially_received"]),
        admin.from("damage_reports").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId).in("status", ["reported", "under_review", "approved"]),
        admin.from("stock_discrepancies").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId).not("status", "in", "(closed,rejected,adjusted)"),
        admin.from("godown_counts").select("id", { count: "exact", head: true }).eq("shop_id", session.shopId).in("status", ["counting", "submitted", "approved"]),
      ])
    : [{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }];
  const transit = grid ? grid.rows.reduce((s, r) => s + r.transit, 0) : 0;
  const pending = grid ? grid.rows.reduce((s, r) => s + r.pending, 0) : 0;
  const negative = grid ? grid.rows.filter((r) => (godowns.find((g) => g.isDefault) ? r.cells[godowns.find((g) => g.isDefault)!.id]?.saleable < 0 : false)).length : 0;

  const setup = [
    { done: (styleCount ?? 0) > 0, label: t("Add your first style with its sizes and colours"), href: "/garment/styles/new" },
    { done: godowns.length > 0, label: t("Add your godowns and the shop floor"), href: "/garment/godowns", locked: !godownsOn },
    { done: godowns.some((g) => g.isDefault), label: t("Mark the shop floor the counter sells from"), href: "/garment/godowns", locked: !godownsOn },
  ];
  const links = [
    { href: "/garment/styles", icon: Shirt, title: t("Styles, sizes & colours"), sub: t("{n} styles", { n: styleCount ?? 0 }), locked: false },
    { href: "/products?categories=1", icon: Tags, title: t("Categories"), sub: t("Add, rename or remove"), locked: false },
    { href: "/garment/stock", icon: Boxes, title: t("Stock by godown"), sub: t("Every size and colour, every place"), locked: !godownsOn },
    { href: "/garment/transfers", icon: Truck, title: t("Transfers"), sub: t("{n} open", { n: openTransfers.count ?? 0 }), locked: !godownsOn },
    { href: "/garment/move", icon: ArrowLeftRight, title: t("Move on the spot"), sub: t("Shop floor ↔ godown"), locked: !godownsOn },
    { href: "/garment/damage", icon: PackageX, title: t("Damage register"), sub: t("{n} need a decision", { n: damage.count ?? 0 }), locked: !godownsOn },
    { href: "/garment/missing", icon: PackageMinus, title: t("Missing stock"), sub: t("{n} open", { n: missing.count ?? 0 }), locked: !godownsOn },
    { href: "/garment/counts", icon: ClipboardList, title: t("Godown stock count"), sub: t("{n} open", { n: counts.count ?? 0 }), locked: !godownsOn },
    { href: "/garment/supplier-returns", icon: RotateCcw, title: t("Supplier returns"), sub: t("Goods back to the vendor"), locked: !returnsOn },
    { href: "/garment/returns", icon: RotateCcw, title: t("Customer returns → godown"), sub: t("Place returned goods"), locked: !godownsOn },
    { href: "/garment/year-end", icon: CalendarCheck, title: t("Year-end stock"), sub: t("Closing and carry forward"), locked: !godownsOn },
    { href: "/garment/reports", icon: FileBarChart, title: t("Godown reports"), sub: t("Registers, movements, valuation"), locked: !godownsOn },
    { href: "/garment/godowns", icon: Warehouse, title: t("Godowns"), sub: t("{n} places", { n: godowns.length }), locked: !godownsOn },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("Stock")} subtitle={t("Sizes, colours and godowns")} icon={<Warehouse size={18} strokeWidth={1.8} />} />

      {setup.some((s) => !s.done) && (
        <section className="neu-card flex flex-col gap-2 p-4">
          <p className="text-sm font-bold text-foreground">{t("Set up your garment stock")}</p>
          <ul className="flex flex-col gap-1.5">
            {setup.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className={`flex items-center gap-2 text-sm ${s.done ? "text-muted line-through" : "font-medium text-brand-text"}`}>
                  {s.locked && <Lock size={12} aria-hidden="true" />} {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {negative > 0 && (
        <Link href="/garment/stock" className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-3.5">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <span className="text-sm text-foreground">{t("{n} item(s) were sold beyond the shop floor's stock — record the move from the godown so each place shows the truth.", { n: negative })}</span>
        </Link>
      )}

      {grid && (
        <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {grid.godowns.map((g) => (
            <div key={g.id} className="neu-card p-3">
              <p className="truncate text-xs font-semibold text-muted">{g.name}{g.isDefault ? ` · ${t("sells here")}` : ""}</p>
              <p className="mt-1 text-xl font-bold text-foreground">{grid.totals[g.id]?.saleable ?? 0}</p>
              {(grid.totals[g.id]?.damaged ?? 0) > 0 && <p className="text-xs text-danger">{t("{n} damaged", { n: grid.totals[g.id].damaged })}</p>}
            </div>
          ))}
          <div className="neu-card p-3">
            <p className="text-xs font-semibold text-muted">{t("On the way")}</p>
            <p className="mt-1 text-xl font-bold text-secondary">{transit}</p>
            {pending > 0 && <p className="text-xs text-warning">{t("{n} short, awaiting settlement", { n: pending })}</p>}
          </div>
        </section>
      )}

      {/* Stock comes in through purchases: the size × colour grid there, and what came in last. */}
      <section className="neu-card flex flex-col gap-2 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-foreground">{t("Stock in: purchases")}</p>
          <Link href="/purchases/new" className="btn-primary-sm flex items-center gap-1.5">
            <PackagePlus size={15} aria-hidden="true" /> {t("Buy stock by size and colour")}
          </Link>
        </div>
        {purchases?.length ? (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {purchases.map((p) => {
              const vendor = (Array.isArray(p.vendors) ? p.vendors[0] : p.vendors) as { name?: string } | null;
              return (
                <li key={p.id}>
                  <Link href={`/purchases/${p.id}`} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">{vendor?.name ?? "—"}</span>
                      <span className="block text-[11px] text-muted">
                        {t("Bill #{no}", { no: p.vendor_invoice_number })} · {new Date(p.purchase_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold text-foreground">{formatMoney(Number(p.total))}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted">{t("Each purchase adds its sizes and colours to stock, in the godown you pick.")}</p>
        )}
      </section>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label={t("Garment stock")}>
        {links.map(({ href, icon: Icon, title, sub, locked }) => (
          <Link key={href} href={href} className="neu-card flex items-center gap-3 p-3.5 transition-colors hover:border-brand">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-text">
              <Icon size={18} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                {title} {locked && <Lock size={12} className="text-muted" aria-label={t("Not in your plan")} />}
              </span>
              <span className="block truncate text-xs text-muted">{sub}</span>
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
