"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { saveThermalPrintSettingsAction, saveDefaultPrintFormatAction, type ThermalPrintSettings } from "@/lib/actions/settings";
import { PageHeader } from "@/app/components/PageHeader";
import { Printer } from "lucide-react";

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-foreground">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        className="relative h-7 w-12 shrink-0 rounded-full p-1"
        style={{ boxShadow: "inset 3px 3px 6px var(--neu-dark), inset -3px -3px 6px var(--neu-light)" }}
      >
        <span
          className={`absolute top-1 flex h-5 w-5 items-center justify-center rounded-full transition-transform ${checked ? "translate-x-5 bg-brand" : "translate-x-0 bg-background"}`}
          style={{
            boxShadow: checked
              ? "-2px -2px 4px rgba(255,255,255,0.35), 2px 2px 4px rgba(0,0,0,0.25)"
              : "-2px -2px 4px var(--neu-light), 2px 2px 4px var(--neu-dark)",
          }}
        />
      </button>
    </div>
  );
}

function SizeSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-foreground">Size</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-brand"
      >
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <option key={n} value={n}>
            {n}× {n === 1 ? "(normal)" : ""}
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
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3.5">
      <p className="mb-1 text-sm font-semibold text-foreground">{title}</p>

      <p className="mt-1 text-xs font-medium text-muted">Shop name line</p>
      <Toggle label="Bold" checked={shopNameBold} onChange={setShopNameBold} />
      <Toggle label="Italic" checked={shopNameItalic} onChange={setShopNameItalic} />
      <SizeSelect value={shopNameSize} onChange={setShopNameSize} />
      <AlignSelect value={shopNameAlign} onChange={setShopNameAlign} />

      <p className="mt-2 text-xs font-medium text-muted">Item table</p>
      <Toggle label="Bold" checked={itemsBold} onChange={setItemsBold} />

      <p className="mt-2 text-xs font-medium text-muted">Total line</p>
      <Toggle label="Bold" checked={totalBold} onChange={setTotalBold} />
      <Toggle label="Italic" checked={totalItalic} onChange={setTotalItalic} />
      <SizeSelect value={totalSize} onChange={setTotalSize} />
      <AlignSelect value={totalAlign} onChange={setTotalAlign} />
    </div>
  );
}

export function ThermalPrintSettingsClient({ initial, initialDefaultFormat }: { initial: ThermalPrintSettings; initialDefaultFormat: "full" | "thermal58" | "thermal" }) {
  const [settings, setSettings] = useState(initial);
  const [defaultFormat, setDefaultFormat] = useState(initialDefaultFormat);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

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
      <PageHeader title="Thermal print settings" icon={<Printer size={18} strokeWidth={1.8} />} />
      <Link href="/profile" className="text-sm text-muted">
        ← Profile
      </Link>

      <div className="rounded-xl border border-border bg-surface p-3.5">
        <p className="mb-2 text-sm font-semibold text-foreground">Default print format</p>
        <p className="mb-2 text-xs text-muted">
          A bill genuinely opens straight in this format — tapping a different format on the print screen itself
          always still works for that one bill.
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

      <p className="text-xs text-muted">
        A Bluetooth thermal printer renders its own fixed characters — size is a genuine multiplier of the
        base font (1× is normal, 2× is double, and so on), not a point-size like a word processor. Italic uses
        the standard printer command, though support varies a little by printer model. 58mm and 80mm paper are
        configured separately since receipts on each often want different emphasis.
      </p>

      <PaperSizeSection
        title="58mm paper"
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
        title="80mm paper"
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
        {isPending ? "Saving…" : saved ? "Saved ✓" : "Save settings"}
      </button>
    </div>
  );
}
