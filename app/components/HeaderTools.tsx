"use client";

import { Calculator, Sparkles } from "lucide-react";
import { openTool } from "@/lib/toolLauncher";

const BUTTON = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-surface-2";

/** Header buttons that open the calculator / assistant panels. */
export function HeaderTools({ calculator, assistant }: { calculator: boolean; assistant: boolean }) {
  return (
    <>
      {assistant && (
        <button type="button" onClick={() => openTool("assistant")} className={BUTTON} aria-label="Ask the assistant" title="Ask the assistant">
          <Sparkles size={18} />
        </button>
      )}
      {calculator && (
        <button type="button" onClick={() => openTool("calculator")} className={BUTTON} aria-label="Open calculator" title="Calculator">
          <Calculator size={18} />
        </button>
      )}
    </>
  );
}
