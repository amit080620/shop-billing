"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/LangContext";
import { createStyleAction } from "@/lib/actions/garment";
import { parseList, parseSizes, variantMatrix, variantName } from "@/lib/garment/rules";

const FIELD = "w-full rounded-lg px-3 py-2 text-sm";
const SIZE_SETS = [
  { label: "S–XXL", value: "S M L XL XXL" },
  { label: "XS–XL", value: "XS S M L XL" },
  { label: "28–36", value: "28 30 32 34 36" },
  { label: "Free size", value: "Free Size" },
];

export function StyleForm({ categories }: { categories: { id: string; name: string }[] }) {
  const { t } = useT();
  const router = useRouter();
  const [name, setName] = useState("");
  const [colours, setColours] = useState("");
  const [sizes, setSizes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const preview = useMemo(() => variantMatrix(parseList(colours), parseSizes(sizes)), [colours, sizes]);

  return (
    <form
      className="flex flex-col gap-4"
      action={(fd) =>
        start(async () => {
          setError(null);
          const r = await createStyleAction(fd);
          if (r.error) setError(r.error);
          else router.push(`/garment/styles/${r.id}`);
        })
      }
    >
      <section className="neu-card flex flex-col gap-2.5 p-4">
        <p className="text-sm font-bold text-foreground">{t("Style")}</p>
        <input name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Style name (e.g. Cotton Kurti)")} className={FIELD} />
        <div className="grid grid-cols-2 gap-2">
          <input name="code" placeholder={t("Style code (e.g. KUR-101)")} className={FIELD} />
          <input name="brand" placeholder={t("Brand")} className={FIELD} />
          <select name="categoryId" defaultValue="" className={FIELD} aria-label={t("Garment category")}>
            <option value="">{t("No category")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input name="hsnCode" placeholder={t("HSN (e.g. 6204)")} className={FIELD} />
          <input name="fabric" placeholder={t("Fabric")} className={FIELD} />
          <input name="season" placeholder={t("Season / collection")} className={FIELD} />
        </div>
      </section>

      <section className="neu-card flex flex-col gap-2.5 p-4">
        <p className="text-sm font-bold text-foreground">{t("Price and tax")}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="text-xs text-muted">
            {t("Selling price (₹)")}
            <input name="price" required type="number" min={0} step="0.01" className={FIELD} />
          </label>
          <label className="text-xs text-muted">
            {t("MRP")}
            <input name="mrp" type="number" min={0} step="0.01" className={FIELD} />
          </label>
          <label className="text-xs text-muted">
            {t("GST %")}
            <select name="gstPercent" defaultValue="5" className={FIELD}>
              {[0, 5, 12, 18].map((g) => (
                <option key={g} value={g}>
                  {g}%
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            {t("Low-stock alert")}
            <input name="lowStock" type="number" min={0} step="1" defaultValue={2} className={FIELD} />
          </label>
        </div>
        <p className="text-xs text-muted">{t("Garments: 5% GST up to ₹1,000 a piece, 12% above, under the rates in force — check yours.")}</p>
        <input type="hidden" name="unit" value="PCS" />
      </section>

      <section className="neu-card flex flex-col gap-2.5 p-4">
        <p className="text-sm font-bold text-foreground">{t("Colours and sizes")}</p>
        <input name="colours" value={colours} onChange={(e) => setColours(e.target.value)} placeholder={t("Colours, with commas (Red, Blue, Black)")} className={FIELD} />
        <input name="sizes" value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder={t("Sizes (S M L XL, or 28 30 32)")} className={FIELD} />
        <div className="flex flex-wrap gap-1.5">
          {SIZE_SETS.map((s) => (
            <button key={s.label} type="button" onClick={() => setSizes(s.value)} className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:border-brand">
              {t(s.label)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="autoBarcode" defaultChecked />
          {t("Make a barcode for each size and colour (print labels from Products)")}
        </label>
        <div className="rounded-lg bg-surface-2 p-3">
          <p className="mb-1.5 text-xs font-semibold text-muted">{t("{n} items will be created", { n: preview.length })}</p>
          <ul className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
            {preview.slice(0, 60).map((v) => (
              <li key={`${v.colour}-${v.size}`} className="rounded-md bg-surface px-2 py-1 text-xs text-foreground">
                {variantName(name || t("Style"), v)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
        {pending ? t("Saving…") : t("Create style and its items")}
      </button>
    </form>
  );
}
