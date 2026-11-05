"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";
import { formatDateTime } from "@/lib/format";
import { ManagerPinBox } from "@/app/components/ManagerPinBox";
import { pinRequest } from "@/lib/managerPinText";
import { bulkImportGarmentAction, garmentExportAction, type GarmentDuplicateChoice, type GarmentImportResult } from "@/lib/actions/garment-import";
import { lastImportAction } from "@/lib/actions/bulk-import";
import { deleteProductsAction } from "@/lib/actions/products";
import { garmentWorkbook, readGarmentRows } from "@/lib/import/garmentFile";
import { GARMENT_SAMPLES, type GarmentRow } from "@/lib/import/garmentItems";

/** Template, export and import of the garment file. Same steps as the other trades' import, on its
 * own file: names already in the shop are asked about before anything is saved, and a wrong file can
 * be taken back out in one go. */
export function GarmentImportClient() {
  const { t } = useT();
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [autoBarcode, setAutoBarcode] = useState(true);
  const [result, setResult] = useState<GarmentImportResult | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<GarmentRow[] | null>(null);
  const [lastImport, setLastImport] = useState<{ at: string; by: string | null; total: number; ids: string[] } | null>(null);
  const [removing, setRemoving] = useState<{ ids: string[]; pinMessage: string | null; busy: boolean; done: string | null }>({ ids: [], pinMessage: null, busy: false, done: null });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    lastImportAction().then((r) => alive && setLastImport(r)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [result]);

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    XLSX.writeFile(garmentWorkbook(XLSX, GARMENT_SAMPLES), "the-ray-garments-template.xlsx", { compression: true });
  }

  async function exportAll() {
    setBusy("export");
    setMessage(null);
    try {
      const data = await garmentExportAction();
      if (data.error) return setMessage(t(data.error));
      if (!data.rows.length) return setMessage(t("No items yet — there is nothing to export."));
      const XLSX = await import("xlsx");
      XLSX.writeFile(garmentWorkbook(XLSX, data.rows, data.stock), `the-ray-garments-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
    } catch {
      setMessage(t("Could not reach the server — try again."));
    } finally {
      setBusy(null);
    }
  }

  async function run(rows: GarmentRow[], choice: GarmentDuplicateChoice) {
    setBusy("import");
    try {
      const res = await bulkImportGarmentAction(rows, choice, autoBarcode);
      setResult(res);
      if (!res.duplicates?.length) setPending(null);
    } catch {
      setResult({ inserted: 0, updated: 0, stylesMade: 0, stockLeft: 0, errors: [{ row: 0, name: "", message: t("The import didn't reach the server — check the internet and try again. Nothing was lost.") }] });
    } finally {
      setBusy(null);
    }
  }

  async function handleFile(file: File) {
    setBusy("import");
    setResult(null);
    setNotes([]);
    setMessage(null);
    setRemoving({ ids: [], pinMessage: null, busy: false, done: null });
    try {
      const XLSX = await import("xlsx");
      const { rows, notes: read } = readGarmentRows(XLSX, await file.arrayBuffer());
      setNotes(read);
      if (!rows.length) {
        setMessage(t("No items found in this file."));
        return;
      }
      setPending(rows);
      await run(rows, "ask");
    } catch {
      setMessage(t("Could not read that file. Use the Excel template above."));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeItems(ids: string[], pin: string | null) {
    if (!pin && !confirm(t("Delete these {n} item(s)? Items that already have sales stay.", { n: ids.length }))) return;
    setRemoving({ ids, pinMessage: null, busy: true, done: null });
    try {
      const res = await deleteProductsAction(ids, pin, "import");
      const ask = pinRequest(res.error);
      if (ask) return setRemoving({ ids, pinMessage: ask, busy: false, done: null });
      if (res.error) return setRemoving({ ids: [], pinMessage: null, busy: false, done: res.error });
      setRemoving({ ids: [], pinMessage: null, busy: false, done: t("{n} item(s) deleted.", { n: res.deleted }) });
      setResult(null);
    } catch {
      setRemoving({ ids: [], pinMessage: null, busy: false, done: t("Could not reach the server — nothing was deleted. Try again.") });
    }
  }

  const already = result?.duplicates?.filter((d) => d.why === "already").length ?? 0;
  const asked = !!result?.duplicates?.length && !!pending;
  const undoIds = result?.insertedIds?.length ? result.insertedIds : null;

  return (
    <div className="flex flex-col gap-3">
      <section className="neu-card flex flex-col gap-3 p-4">
        <p className="text-sm font-bold text-foreground">{t("How it works")}</p>
        <ol className="flex list-decimal flex-col gap-1 pl-4 text-sm text-foreground">
          <li>{t("Download the template: its columns are style, colour, size, price, stock and godown.")}</li>
          <li>{t("One row is one size of one colour. Or write Red, Blue and S M L on one row to make an item for each.")}</li>
          <li>{t("Import the file. Styles, sizes, colours and barcodes are made, and opening stock goes into its godown.")}</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void downloadTemplate()} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground">
            <Download size={15} aria-hidden="true" /> {t("Download template")}
          </button>
          <button type="button" onClick={() => void exportAll()} disabled={busy !== null} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-60">
            <Download size={15} aria-hidden="true" /> {busy === "export" ? t("Preparing…") : t("Export all items")}
          </button>
        </div>
        <p className="text-xs text-muted">{t("Export gives the same file with all your items and where their stock is. Change prices in Excel and import it back; stock doesn't change that way.")}</p>
      </section>

      <section className="neu-card flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="flex items-center gap-1.5 font-semibold text-foreground">
            <Upload size={15} aria-hidden="true" /> {t("Import Excel or CSV file")}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={busy !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
            className="text-xs text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={autoBarcode} onChange={(e) => setAutoBarcode(e.target.checked)} />
          {t("Make a barcode for each new item that has none")}
        </label>
        {busy === "import" && <p className="text-xs text-muted">{t("Importing…")}</p>}
        {message && <p className="text-sm text-danger">{message}</p>}
        {notes.map((n) => (
          <p key={n} className="text-xs text-muted">
            {n}
          </p>
        ))}
      </section>

      {asked && pending && (
        <section className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3.5 text-sm text-foreground">
          <p className="font-semibold">{t("{n} item(s) are already in your shop or twice in this file — nothing is saved yet.", { n: result?.duplicates?.length ?? 0 })}</p>
          <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto text-xs">
            {result?.duplicates?.slice(0, 30).map((d) => (
              <li key={`${d.row}-${d.name}`}>
                {t("Row {row}", { row: d.row })}: {d.name} — {d.why === "already" ? t("already in your items") : t("twice in this file")}
              </li>
            ))}
            {(result?.duplicates?.length ?? 0) > 30 && <li>{t("…and {n} more.", { n: (result?.duplicates?.length ?? 0) - 30 })}</li>}
          </ul>
          <div className="flex flex-wrap gap-2">
            {already > 0 && (
              <button type="button" disabled={busy !== null} onClick={() => void run(pending, "update")} className="btn-primary-sm disabled:opacity-60">
                {t("Update those items with this file")}
              </button>
            )}
            <button type="button" disabled={busy !== null} onClick={() => void run(pending, "skip")} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-60">
              {t("Leave these out, import the rest")}
            </button>
          </div>
          {already > 0 && <p className="text-xs">{t("Update changes only the cells filled in the file, and never the stock.")}</p>}
        </section>
      )}

      {result && !asked && (
        <section className="neu-card flex flex-col gap-1.5 p-4 text-sm">
          <p className="font-semibold text-foreground">{t("{n} new item(s) saved in {s} new style(s), {u} updated.", { n: result.inserted, s: result.stylesMade, u: result.updated })}</p>
          {result.stockLeft > 0 && <p className="text-xs text-muted">{t("Stock wasn't changed for {n} item(s) already here. Use a stock count or a purchase for that.", { n: result.stockLeft })}</p>}
          {result.errors.length > 0 && (
            <div className="flex max-h-60 flex-col gap-0.5 overflow-y-auto text-xs text-danger">
              {result.errors.map((e, i) => (
                <p key={i}>
                  {e.row > 0 ? t("Row {row}", { row: e.row }) : t("Note")}
                  {e.name ? ` (${e.name})` : ""}: {e.message}
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      {undoIds && !removing.busy && (
        <button type="button" onClick={() => void removeItems(undoIds, null)} className="self-start text-xs font-semibold text-danger underline">
          {t("Wrong file? Delete the {n} new item(s) this import added", { n: undoIds.length })}
        </button>
      )}
      {!undoIds && lastImport && !result && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted">
          <span>{t("Last import: {at} — {n} of its {total} new item(s) still in your list.", { at: formatDateTime(lastImport.at), n: lastImport.ids.length, total: lastImport.total })}</span>
          <button type="button" disabled={removing.busy} onClick={() => void removeItems(lastImport.ids, null)} className="font-semibold text-danger underline disabled:opacity-50">
            {t("Delete those {n}", { n: lastImport.ids.length })}
          </button>
        </div>
      )}
      {removing.pinMessage && (
        <ManagerPinBox message={removing.pinMessage} busy={removing.busy} submitLabel={t("Delete {n}", { n: removing.ids.length })} onSubmit={(pin) => void removeItems(removing.ids, pin)} onCancel={() => setRemoving({ ids: [], pinMessage: null, busy: false, done: null })} />
      )}
      {removing.busy && <p className="text-xs text-muted">{t("Deleting…")}</p>}
      {removing.done && <p className="text-xs font-semibold text-brand-text">{removing.done}</p>}
    </div>
  );
}
