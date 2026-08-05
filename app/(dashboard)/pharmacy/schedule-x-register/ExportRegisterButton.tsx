"use client";

import { downloadCsv } from "@/app/components/downloadCsv";

type Row = {
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

export function ExportRegisterButton({ rows }: { rows: Row[] }) {
  function exportCsv() {
    downloadCsv(
      "schedule-x-register.csv",
      ["Date", "Invoice Number", "Medicine", "Batch", "Quantity", "Customer", "Phone", "Doctor", "Patient"],
      rows.map((r) => [
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
    <button onClick={exportCsv} className="self-start rounded-lg border border-brand bg-brand-soft px-3.5 py-2 text-sm font-medium text-brand-dark">
      📥 Export register (CSV)
    </button>
  );
}
