"use client";

import { downloadCsv } from "@/app/components/downloadCsv";

type Row = {
  schedule: "h1" | "x";
  date: string;
  invoiceNumber: string;
  medicine: string;
  batchNumber: string;
  quantity: number;
  customerName: string;
  customerPhone: string;
  doctorName: string;
  patientName: string;
};

export function ExportRegisterButton({ rows, label }: { rows: Row[]; label: string }) {
  function exportCsv() {
    downloadCsv(
      "schedule-h1-x-register.csv",
      ["Schedule", "Date", "Invoice Number", "Medicine", "Batch", "Quantity", "Customer", "Phone", "Doctor", "Patient"],
      rows.map((r) => [
        r.schedule.toUpperCase(),
        new Date(r.date).toLocaleDateString("en-IN"),
        r.invoiceNumber,
        r.medicine,
        r.batchNumber,
        r.quantity,
        r.customerName,
        r.customerPhone,
        r.doctorName,
        r.patientName,
      ]),
    );
  }

  return (
    <button onClick={exportCsv} className="self-start rounded-lg border border-brand bg-brand-soft px-3.5 py-2 text-sm font-medium text-brand-text">
      {label}
    </button>
  );
}
