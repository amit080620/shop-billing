import Link from "@/lib/link";
import { Shirt } from "lucide-react";
import { PageHeader } from "@/app/components/PageHeader";
import { BackLink } from "@/app/components/BackLink";
import { allRows } from "@/lib/supabase/allRows";
import { garmentGate } from "../gate";

export default async function StylesPage() {
  const gate = await garmentGate(null);
  if ("blocked" in gate) return gate.blocked;
  const { session, admin, t } = gate;
  const [{ data: styles }, products] = await Promise.all([
    admin.from("product_styles").select("id, name, code, brand, season, is_active").eq("shop_id", session.shopId).order("name"),
    allRows((a, b) => admin.from("products").select("style_id, stock_quantity").eq("shop_id", session.shopId).not("style_id", "is", null).order("id").range(a, b)),
  ]);
  const agg = new Map<string, { variants: number; stock: number }>();
  for (const p of products.data) {
    const a = agg.get(p.style_id as string) ?? { variants: 0, stock: 0 };
    a.variants += 1;
    a.stock += Number(p.stock_quantity);
    agg.set(p.style_id as string, a);
  }
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/garment" />
      <PageHeader
        title={t("Styles, sizes & colours")}
        subtitle={t("Each colour × size is its own item: own barcode, price and stock")}
        icon={<Shirt size={18} strokeWidth={1.8} />}
        action={
          <Link href="/garment/styles/new" className="btn-primary-sm">
            + {t("Style")}
          </Link>
        }
      />
      {(styles ?? []).length === 0 ? (
        <p className="neu-card p-4 text-sm text-muted">{t("No styles yet. Add one with its colours and sizes — every combination is created at once.")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(styles ?? []).map((s) => {
            const a = agg.get(s.id) ?? { variants: 0, stock: 0 };
            return (
              <li key={s.id}>
                <Link href={`/garment/styles/${s.id}`} className="neu-card flex items-center justify-between gap-3 p-3.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {s.name} {s.code && <span className="text-xs font-normal text-muted">· {s.code}</span>}
                    </span>
                    <span className="block truncate text-xs text-muted">{[s.brand, s.season, t("{n} sizes/colours", { n: a.variants })].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="shrink-0 text-right text-sm font-bold text-foreground">
                    {a.stock}
                    <span className="block text-[11px] font-normal text-muted">{t("in stock")}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
