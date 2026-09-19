"use client";

import { downloadCsv } from "./downloadCsv";
import { useT } from "@/lib/i18n/LangContext";

export function ExportCsvButton({
  filename,
  headers,
  rows,
}: {
  filename: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  const { t } = useT();
  return (
    <button
      onClick={() => downloadCsv(filename, headers, rows)}
      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground"
    >
      {t("Export CSV")}
    </button>
  );
}
