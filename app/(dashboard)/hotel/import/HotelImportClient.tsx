"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { hotelExportAction, importHotelFileAction, type HotelImportResult } from "@/lib/actions/hotel-import";
import { hotelExportBook, hotelTemplate, readHotelFile } from "@/lib/hotel/importFile";
import { useT } from "@/lib/i18n/LangContext";
import { HOTEL_INPUT, HOTEL_LABEL } from "../ui";

export function HotelImportClient({ from: initialFrom, to: initialTo }: { from: string; to: string }) {
  const { t } = useT();
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<HotelImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function template() {
    const XLSX = await import("xlsx");
    XLSX.writeFile(hotelTemplate(XLSX), "the-ray-hotel-template.xlsx", { compression: true });
  }

  async function exportAll() {
    setBusy("export");
    setMessage(null);
    try {
      const r = await hotelExportAction(from, to);
      if (r.error || !r.sheets) return setMessage(r.error ? t(r.error) : t("Could not reach the server — try again."));
      const XLSX = await import("xlsx");
      XLSX.writeFile(hotelExportBook(XLSX, r.sheets), `the-ray-hotel-${from}-to-${to}.xlsx`, { compression: true });
    } catch {
      setMessage(t("Could not reach the server — try again."));
    } finally {
      setBusy(null);
    }
  }

  async function handleFile(file: File) {
    setBusy("import");
    setResult(null);
    setMessage(null);
    try {
      const XLSX = await import("xlsx");
      const { rooms, bookings } = readHotelFile(XLSX, await file.arrayBuffer());
      if (!rooms.length && !bookings.length) return setMessage(t("No rooms or bookings found in this file. Use the Excel template above."));
      setResult(await importHotelFileAction(rooms, bookings));
    } catch {
      setMessage(t("Could not read that file. Use the Excel template above."));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="neu-card flex flex-col gap-3 p-4">
        <p className="text-sm font-bold text-foreground">{t("Bring in rooms and bookings")}</p>
        <ol className="flex list-decimal flex-col gap-1 pl-4 text-sm text-foreground">
          <li>{t("Download the template: one sheet for rooms, one for upcoming bookings.")}</li>
          <li>{t("Fill either or both. Write room numbers like 101-110.")}</li>
          <li>{t("Import the file. Rooms and bookings already here are left as they are, so a second import is safe.")}</li>
        </ol>
        <button type="button" onClick={() => void template()} className="flex items-center gap-1.5 self-start rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground">
          <Download size={15} aria-hidden="true" /> {t("Download template")}
        </button>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="flex items-center gap-1.5 font-semibold text-foreground">
            <Upload size={15} aria-hidden="true" /> {t("Import Excel file")}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            disabled={busy !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
            className="text-xs text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
          />
        </label>
        {busy === "import" && <p className="text-xs text-muted">{t("Importing… please keep this screen open.")}</p>}
      </section>

      {message && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{message}</p>}

      {result && (
        <section className="neu-card flex flex-col gap-1.5 p-4 text-sm">
          <p className="font-semibold text-foreground">{t("{t} room type(s) and {r} room(s) added. {b} booking(s) made.", { t: result.typesMade, r: result.roomsAdded, b: result.bookingsMade })}</p>
          {result.roomsSkipped + result.bookingsSkipped > 0 && <p className="text-xs text-muted">{t("Already here, left as they are: {r} room(s), {b} booking(s).", { r: result.roomsSkipped, b: result.bookingsSkipped })}</p>}
          {result.errors.length > 0 && (
            <div className="flex max-h-60 flex-col gap-0.5 overflow-y-auto text-xs text-danger">
              {result.errors.map((e, i) => (
                <p key={i}>
                  {e.row > 0 ? `${t(e.sheet)}: ${t("Row {row}", { row: e.row })}: ` : ""}
                  {t(e.message)}
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="neu-card flex flex-col gap-3 p-4">
        <div>
          <p className="text-sm font-bold text-foreground">{t("Export to Excel")}</p>
          <p className="text-xs text-muted">{t("One file with your rooms, bookings, guest register, charges, payments and Form C details for the period.")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={HOTEL_LABEL}>
            {t("From")}
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={HOTEL_INPUT} />
          </label>
          <label className={HOTEL_LABEL}>
            {t("To")}
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={HOTEL_INPUT} />
          </label>
        </div>
        <button type="button" onClick={() => void exportAll()} disabled={busy !== null} className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-60">
          <Download size={15} aria-hidden="true" /> {busy === "export" ? t("Preparing…") : t("Export")}
        </button>
      </section>
    </div>
  );
}
