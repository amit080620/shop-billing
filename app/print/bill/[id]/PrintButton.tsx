"use client";

import { useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";

export function PrintButton({ labels }: { labels?: { print: string; printing: string; kioskHint: string } }) {
  const [justClicked, setJustClicked] = useState(false);
  const { t } = useT();
  // Print pages live outside the dashboard layout, so there is no
  // LangProvider above them — they pass the words in instead.
  const text = labels ?? { print: t("billPage.print"), printing: t("billPage.printing"), kioskHint: t("billPage.kioskHint") };

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
        {justClicked ? text.printing : text.print}
      </button>
      {/* Kiosk printing is a laptop/desktop setup; phones can't use it. */}
      <Link href="/fast-print-setup" className="hidden text-[11px] text-gray-400 underline md:inline">
        {text.kioskHint}
      </Link>
    </div>
  );
}
