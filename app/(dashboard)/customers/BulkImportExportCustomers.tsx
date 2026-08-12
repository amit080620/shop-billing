"use client";

import { useRef, useState } from "react";
import { startBulkImportCustomersAction, getBulkImportJobStatusAction, fetchAllCustomersForExportAction, type CustomerImportResult } from "@/lib/actions/bulk-import";
import { downloadCsv } from "@/app/components/downloadCsv";

const BASE_HEADERS = ["name", "phone", "gstin", "address", "stateCode", "dateOfBirth", "gender"];
const CLINIC_HEADERS = ["bloodGroup", "knownAllergies"];
const GYM_HEADERS = ["fitnessGoal", "heightCm", "weightKg"];

function normalizeKey(k: string) {
  return k.trim().toLowerCase().replace(/[\s_-]/g, "");
}

export function BulkImportExportCustomers({
  onImported,
  isClinic,
  isGym,
}: {
  onImported: () => void;
  isClinic: boolean;
  isGym: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<CustomerImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noun = isClinic ? "patients" : isGym ? "members" : "customers";
  const headers = [...BASE_HEADERS, ...(isClinic ? CLINIC_HEADERS : isGym ? GYM_HEADERS : [])];

  function downloadTemplate() {
    const sample = isClinic
      ? ["Rahul Sharma", "9876543210", "", "12 MG Road, Pune", "27", "1990-05-14", "male", "B+", "Penicillin"]
      : isGym
        ? ["Rahul Sharma", "9876543210", "", "12 MG Road, Pune", "27", "1990-05-14", "male", "Weight Loss", "175", "78"]
        : ["Rahul Sharma", "9876543210", "", "12 MG Road, Pune", "27", "", ""];
    downloadCsv(`${noun}-import-template.csv`, headers, [sample]);
  }

  async function exportCustomers() {
    setIsExporting(true);
    try {
      const all = await fetchAllCustomersForExportAction();
      const rows = all.map((c) => {
        const base = [c.name, c.phone, c.gstin ?? "", c.address ?? "", c.stateCode ?? "", c.dateOfBirth ?? "", c.gender ?? ""];
        if (isClinic) return [...base, c.bloodGroup ?? "", c.knownAllergies ?? ""];
        if (isGym) return [...base, c.fitnessGoal ?? "", c.heightCm?.toString() ?? "", c.weightKg?.toString() ?? ""];
        return base;
      });
      downloadCsv(`${noun}-export.csv`, headers, rows);
    } finally {
      setIsExporting(false);
    }
  }

  async function handleFile(file: File) {
    setIsImporting(true);
    setResult(null);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        setResult({ inserted: 0, errors: [{ row: 0, name: "", message: "File is empty" }] });
        setIsImporting(false);
        return;
      }
      const headerRow = lines[0].split(",").map((h) => normalizeKey(h.replace(/^"|"$/g, "")));
      const rows = lines.slice(1).map((line) => {
        const cells = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
        const get = (key: string) => {
          const idx = headerRow.indexOf(normalizeKey(key));
          return idx >= 0 ? cells[idx] ?? "" : "";
        };
        return {
          name: get("name"),
          phone: get("phone"),
          gstin: get("gstin"),
          address: get("address"),
          stateCode: get("stateCode"),
          dateOfBirth: get("dateOfBirth"),
          gender: get("gender"),
          bloodGroup: get("bloodGroup"),
          knownAllergies: get("knownAllergies"),
          fitnessGoal: get("fitnessGoal"),
          heightCm: get("heightCm"),
          weightKg: get("weightKg"),
        };
      });

      const started = await startBulkImportCustomersAction(rows);
      if ("error" in started) {
        setResult({ inserted: 0, errors: [{ row: 0, name: "", message: started.error }] });
        setIsImporting(false);
        return;
      }

      // Poll every second — the actual insert runs in the background
      // (Next.js after()), so this request already returned instantly;
      // this is just checking in on progress rather than blocking on it.
      const poll = setInterval(async () => {
        const status = await getBulkImportJobStatusAction(started.jobId);
        if ("error" in status) {
          clearInterval(poll);
          setIsImporting(false);
          return;
        }
        if (status.status === "completed" && status.result) {
          clearInterval(poll);
          setResult(status.result);
          setIsImporting(false);
          if (status.result.inserted > 0) onImported();
        }
      }, 1000);
      return;
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="self-start text-sm font-medium text-brand">
        📤 Bulk import / export {noun}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-brand-dark">Bulk import / export</p>
        <button onClick={() => setOpen(false)} className="text-xs font-medium text-muted">
          Close
        </button>
      </div>
      <p className="text-xs text-muted">
        For setting up your whole {noun.slice(0, -1)} list at once — download the template, fill it in Excel or Google Sheets, then import.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={downloadTemplate} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground">
          Download template
        </button>
        <button
          type="button"
          onClick={exportCustomers}
          disabled={isExporting}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-50"
        >
          {isExporting ? "Exporting…" : `Export all ${noun}`}
        </button>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-brand-dark">Import CSV file</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          disabled={isImporting}
          className="text-xs text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
        />
      </label>
      {isImporting && <p className="text-xs text-muted">Importing in the background — this page will update automatically…</p>}
      {result && (
        <div className="rounded-lg bg-surface p-3 text-xs">
          <p className="font-medium text-brand-dark">{result.inserted} {noun} imported.</p>
          {result.errors.length > 0 && (
            <div className="mt-1.5 flex flex-col gap-0.5 text-credit">
              {result.errors.slice(0, 10).map((e, i) => (
                <p key={i}>
                  {e.row > 0 ? `Row ${e.row}${e.name ? ` (${e.name})` : ""}: ` : ""}{e.message}
                </p>
              ))}
              {result.errors.length > 10 && <p>...and {result.errors.length - 10} more.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
