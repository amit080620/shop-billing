"use client";

import { useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";

export function PrintButton() {
  const [justClicked, setJustClicked] = useState(false);
  const { t } = useT();

  return (
    <div className="no-print flex w-full flex-col items-center gap-1">
      <button
        onClick={() => {
          setJustClicked(true);
          window.print();
          setTimeout(() => setJustClicked(false), 900);
        }}
        className={`bill-action ${justClicked ? "animate-save-success" : ""}`}
      >
        <Printer size={15} />
        {justClicked ? t("billPage.printing") : t("billPage.print")}
      </button>
      {/* Kiosk printing is a laptop/desktop setup; phones can't use it. */}
      <Link href="/fast-print-setup" className="hidden text-[11px] text-gray-400 underline md:inline">
        {t("billPage.kioskHint")}
      </Link>
    </div>
  );
}
