"use client";

import { Calculator, Sparkles } from "lucide-react";
import { openTool } from "@/lib/toolLauncher";
import { ScreenVideoLink } from "./ScreenVideoLink";

const BUTTON = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-surface-2";

/** Header buttons: this screen's training video, and the calculator / assistant panels.
 * `videoNote`: the New look's bar — the video says it shows the Classic look. */
export function HeaderTools({ calculator, assistant, videoNote }: { calculator: boolean; assistant: boolean; videoNote?: boolean }) {
  return (
    <>
      <ScreenVideoLink classicNote={videoNote} />
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
