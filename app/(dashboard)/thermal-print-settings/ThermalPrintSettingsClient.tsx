"use client";

import { useState, useTransition } from "react";
import { saveThermalPrintSettingsAction, saveDefaultPrintFormatAction, type ThermalPrintSettings } from "@/lib/actions/settings";
import { PageHeader } from "@/app/components/PageHeader";
import { Printer } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";
import { BackLink } from "@/app/components/BackLink";
import Link from "next/link";
import { ThermalRenderer, type ThermalReceiptData } from "@/lib/print/ThermalRenderer";
import { THERMAL_SIZE_LEVELS, thermalFormatFor } from "@/lib/print/thermalFormat";

// A made-up receipt, so the look can be judged without making a real bill.
const SAMPLE_RECEIPT: ThermalReceiptData = {
  shopName: "Sharma General Store",
  gstin: "27ABCDE1234F1Z5",
  invoiceNumber: "2026-27/00042",
  dateText: "26 Sept 2026, 4:12 pm",
  placeOfSupplyText: "Same state (CGST + SGST)",
  items: [
    { name: "Basmati Rice 5kg", qty: 1, rate: 620, amount: 620 },
    { name: "Amul Butter 500g", qty: 2, rate: 275, amount: 550 },
    { name: "Tata Salt 1kg", qty: 3, rate: 28, amount: 84 },
  ],
  subtotal: 1254,
  taxableAmount: 1194.29,
  isIntraState: true,
  cgstAmount: 29.86,
  sgstAmount: 29.85,
  total: 1254,
  paidAmount: 1254,
  paymentLabel: "Cash",
};

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-foreground">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        className="relative h-7 w-12 shrink-0 rounded-full p-1"
        style={{ boxShadow: "var(--elev-inset)" }}
      >
        <span
          className={`absolute top-1 flex h-5 w-5 items-center justify-center rounded-full transition-transform ${checked ? "translate-x-5 bg-brand" : "translate-x-0 bg-background"}`}
          style={{
            boxShadow: checked
              ? "-2px -2px 4px rgba(255,255,255,0.35), 2px 2px 4px rgba(0,0,0,0.25)"
              : "var(--elev-xs)",
          }}
        />
      </button>
    </div>
  );
}

function SizeSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t } = useT();
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-foreground">{t("Font size")}</span>
      <select
        value={Math.min(THERMAL_SIZE_LEVELS.length - 1, Math.max(0, value))}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-brand"
      >
        {THERMAL_SIZE_LEVELS.map((l) => (
          <option key={l.level} value={l.level}>
            {t(l.label)}
          </option>
        ))}
      </select>
    </div>
  );
}

function AlignSelect({ value, onChange }: { value: "left" | "center" | "right"; onChange: (v: "left" | "center" | "right") => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-foreground">Alignment</span>
      <div className="flex gap-1">
        {(["left", "center", "right"] as const).map((a) => (
          <button
            key={a}
            onClick={() => onChange(a)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${value === a ? "bg-brand text-white" : "bg-background text-muted"}`}
          >
            {a}
          </button>
        ))}
      </div>
    </div>
  );
}

function PaperSizeSection({
  title,
  shopNameBold,
  setShopNameBold,
  shopNameItalic,
  setShopNameItalic,
  shopNameSize,
  setShopNameSize,
  shopNameAlign,
  setShopNameAlign,
  itemsBold,
  setItemsBold,
  totalBold,
  setTotalBold,
  totalItalic,
  setTotalItalic,
  totalSize,
  setTotalSize,
  totalAlign,
  setTotalAlign,
}: {
  title: string;
  shopNameBold: boolean;
  setShopNameBold: (v: boolean) => void;
  shopNameItalic: boolean;
  setShopNameItalic: (v: boolean) => void;
  shopNameSize: number;
  setShopNameSize: (v: number) => void;
  shopNameAlign: "left" | "center" | "right";
  setShopNameAlign: (v: "left" | "center" | "right") => void;
  itemsBold: boolean;
  setItemsBold: (v: boolean) => void;
  totalBold: boolean;
  setTotalBold: (v: boolean) => void;
  totalItalic: boolean;
  setTotalItalic: (v: boolean) => void;
  totalSize: number;
  setTotalSize: (v: number) => void;
  totalAlign: "left" | "center" | "right";
  setTotalAlign: (v: "left" | "center" | "right") => void;
}) {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3.5">
      <p className="mb-1 text-sm font-semibold text-foreground">{title}</p>

      <p className="mt-1 text-xs font-medium text-muted">{t("Shop name line")}</p>
      <Toggle label="Bold" checked={shopNameBold} onChange={setShopNameBold} />
      <Toggle label="Italic" checked={shopNameItalic} onChange={setShopNameItalic} />
      <SizeSelect value={shopNameSize} onChange={setShopNameSize} />
      <AlignSelect value={shopNameAlign} onChange={setShopNameAlign} />

      <p className="mt-2 text-xs font-medium text-muted">{t("Item table")}</p>
      <Toggle label="Bold" checked={itemsBold} onChange={setItemsBold} />

      <p className="mt-2 text-xs font-medium text-muted">{t("Total line")}</p>
      <Toggle label="Bold" checked={totalBold} onChange={setTotalBold} />
      <Toggle label="Italic" checked={totalItalic} onChange={setTotalItalic} />
      <SizeSelect value={totalSize} onChange={setTotalSize} />
      <AlignSelect value={totalAlign} onChange={setTotalAlign} />
    </div>
  );
}

export function ThermalPrintSettingsClient({ initial, initialDefaultFormat }: { initial: ThermalPrintSettings; initialDefaultFormat: "full" | "thermal58" | "thermal" }) {
  const { t } = useT();
  const [settings, setSettings] = useState(initial);
  const [defaultFormat, setDefaultFormat] = useState(initialDefaultFormat);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [previewPaper, setPreviewPaper] = useState<58 | 80>(58);

  function update<K extends keyof ThermalPrintSettings>(key: K, value: ThermalPrintSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    startTransition(async () => {
      const [r1, r2] = await Promise.all([saveThermalPrintSettingsAction(settings), saveDefaultPrintFormatAction(defaultFormat)]);
      if (!r1.error && !r2.error) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <BackLink fallback="/profile" />
      <PageHeader title={t("Thermal print settings")} icon={<Printer size={18} strokeWidth={1.8} />} />

      <Link
        href="/plans#hardware"
        className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand-soft px-3.5 py-3 text-sm"
      >
        <Printer size={18} className="shrink-0 text-brand-text" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-brand-text">{t("Don't have a printer yet?")}</span>
          <span className="block text-xs text-muted">{t("See the printers we've tested with The Ray — 58mm Bluetooth from ₹2,499.")}</span>
        </span>
        <span className="text-brand-text" aria-hidden="true">›</span>
      </Link>

      <div className="rounded-xl border border-border bg-surface p-3.5">
        <p className="mb-2 text-sm font-semibold text-foreground">{t("Default print format")}</p>
        <p className="mb-2 text-xs text-muted">
          {t("A bill genuinely opens straight in this format — tapping a different format on the print screen itself always still works for that one bill.")}
        </p>
        <div className="flex gap-1.5">
          {([
            { v: "full", label: "A4" },
            { v: "thermal58", label: "58mm" },
            { v: "thermal", label: "80mm" },
          ] as const).map((opt) => (
            <button
              key={opt.v}
              onClick={() => setDefaultFormat(opt.v)}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium ${
                defaultFormat === opt.v ? "bg-brand text-white" : "border border-border text-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{t("Live preview")}</p>
          <div className="flex gap-1">
            {([58, 80] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setPreviewPaper(w)}
                aria-pressed={previewPaper === w}
                className={`rounded-full px-3 py-1 text-xs font-medium ${previewPaper === w ? "bg-brand text-white" : "border border-border text-muted"}`}
              >
                {w}mm
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-center overflow-x-auto rounded-lg bg-surface-2 p-3">
          <div className="shadow-sm">
            <ThermalRenderer data={SAMPLE_RECEIPT} paperWidth={previewPaper} format={thermalFormatFor(settings, previewPaper)} />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          {t("This is how a bill looks when you print it from the browser, a USB printer or a phone's print option, and on the screen.")}
        </p>
      </div>

      <p className="text-xs text-muted">
        {t("A Bluetooth thermal printer draws its own built-in text, so it takes only some of these: bold and alignment are sent to it (a Large size or above prints bold), and the item table bold. Size and italic depend on the printer model and can print stray characters, so they are not sent to it. 58mm and 80mm paper are set separately.")}
      </p>

      <PaperSizeSection
        title={t("58mm paper")}
        shopNameBold={settings.t58ShopNameBold}
        setShopNameBold={(v) => update("t58ShopNameBold", v)}
        shopNameItalic={settings.t58ShopNameItalic}
        setShopNameItalic={(v) => update("t58ShopNameItalic", v)}
        shopNameSize={settings.t58ShopNameSize}
        setShopNameSize={(v) => update("t58ShopNameSize", v)}
        shopNameAlign={settings.t58ShopNameAlign}
        setShopNameAlign={(v) => update("t58ShopNameAlign", v)}
        itemsBold={settings.t58ItemsBold}
        setItemsBold={(v) => update("t58ItemsBold", v)}
        totalBold={settings.t58TotalBold}
        setTotalBold={(v) => update("t58TotalBold", v)}
        totalItalic={settings.t58TotalItalic}
        setTotalItalic={(v) => update("t58TotalItalic", v)}
        totalSize={settings.t58TotalSize}
        setTotalSize={(v) => update("t58TotalSize", v)}
        totalAlign={settings.t58TotalAlign}
        setTotalAlign={(v) => update("t58TotalAlign", v)}
      />

      <PaperSizeSection
        title={t("80mm paper")}
        shopNameBold={settings.t80ShopNameBold}
        setShopNameBold={(v) => update("t80ShopNameBold", v)}
        shopNameItalic={settings.t80ShopNameItalic}
        setShopNameItalic={(v) => update("t80ShopNameItalic", v)}
        shopNameSize={settings.t80ShopNameSize}
        setShopNameSize={(v) => update("t80ShopNameSize", v)}
        shopNameAlign={settings.t80ShopNameAlign}
        setShopNameAlign={(v) => update("t80ShopNameAlign", v)}
        itemsBold={settings.t80ItemsBold}
        setItemsBold={(v) => update("t80ItemsBold", v)}
        totalBold={settings.t80TotalBold}
        setTotalBold={(v) => update("t80TotalBold", v)}
        totalItalic={settings.t80TotalItalic}
        setTotalItalic={(v) => update("t80TotalItalic", v)}
        totalSize={settings.t80TotalSize}
        setTotalSize={(v) => update("t80TotalSize", v)}
        totalAlign={settings.t80TotalAlign}
        setTotalAlign={(v) => update("t80TotalAlign", v)}
      />

      <button onClick={save} disabled={isPending} className={`btn-primary w-full text-center disabled:opacity-60 ${saved ? "animate-save-success" : ""}`}>
        {isPending ? t("Saving…") : saved ? t("Saved ✓") : t("Save settings")}
      </button>
    </div>
  );
}
