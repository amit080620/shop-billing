"use client";

import { useState } from "react";
import { CameraCapture } from "@/app/components/CameraCapture";
import { preprocessImage } from "@/lib/ocr/preprocess";
import { Camera } from "lucide-react";
import { runOCR, PSM } from "@/lib/ocr/tesseract";
import { parsePettyCashFields } from "@/lib/ocr/parser";
import { confidenceLevel } from "@/lib/ocr/types";
import type { ExtractedPettyCashFields } from "@/lib/ocr/types";

type Step = "capture" | "processing" | "review" | "error";

export function ScanBillModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (fields: { description: string; amount: string }) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>("capture");
  const [statusText, setStatusText] = useState("Preparing image…");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedPettyCashFields | null>(null);
  const [vendorInput, setVendorInput] = useState("");
  const [amountInput, setAmountInput] = useState("");

  async function handleCapture(file: Blob) {
    setStep("processing");
    setErrorMessage(null);
    try {
      setStatusText("Enhancing image…");
      setProgress(10);
      const processed = await preprocessImage(file);

      setStatusText("Reading text…");
      const ocr = await runOCR(
        processed,
        (status, p) => {
          setStatusText(
            status === "recognizing text" ? "Reading text…" : status === "loading tesseract core" ? "Starting OCR engine…" : "Processing…",
          );
          setProgress(10 + p * 80);
        },
        PSM.SINGLE_COLUMN,
      );

      setStatusText("Finding amount & vendor…");
      setProgress(95);
      const fields = parsePettyCashFields(ocr);
      setExtracted(fields);
      setVendorInput(fields.vendorName?.value ?? "");
      setAmountInput(fields.amount ? String(fields.amount.value) : "");
      setProgress(100);
      setStep("review");
    } catch {
      setErrorMessage("We couldn't confidently read this bill. Try a clearer photo with the full bill visible, or enter the details manually.");
      setStep("error");
    }
  }

  if (step === "capture") {
    return <CameraCapture onCapture={handleCapture} onCancel={onCancel} />;
  }

  if (step === "processing") {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center">
        <div className="spin h-10 w-10 rounded-full border-4 border-white/20 border-t-white" />
        <p className="text-sm text-white">{statusText}</p>
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/20">
          <div className="h-full bg-white transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-xs text-white/60">Processing happens on your device — nothing is uploaded.</p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center">
        <Camera size={30} className="text-white/70" />
        <p className="max-w-xs text-sm text-white">{errorMessage}</p>
        <div className="flex gap-2">
          <button onClick={() => setStep("capture")} className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black">
            Retake photo
          </button>
          <button onClick={onCancel} className="rounded-lg border border-white/30 px-4 py-2 text-sm text-white">
            Enter manually
          </button>
        </div>
      </div>
    );
  }

  // Review step — every field editable, confidence shown, nothing saved yet.
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-surface p-5 sm:rounded-2xl">
        <p className="text-sm font-semibold text-foreground">Review scanned bill</p>
        <p className="mt-0.5 text-xs text-muted">Check these before adding — OCR isn&apos;t always perfect.</p>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between text-xs font-medium text-foreground">
              Vendor / what was it for
              <ConfidenceBadge score={extracted?.vendorName?.confidence} />
            </span>
            <input
              value={vendorInput}
              onChange={(e) => setVendorInput(e.target.value)}
              placeholder="e.g. Tea for staff"
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between text-xs font-medium text-foreground">
              Amount (₹)
              <ConfidenceBadge score={extracted?.amount?.confidence} />
            </span>
            <input
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>

          {!extracted?.amount && (
            <p className="rounded-lg bg-credit-soft px-3 py-2 text-xs text-credit">
              Couldn&apos;t confidently find a total — please enter the amount yourself.
            </p>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={() => setStep("capture")} className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground">
            Retake
          </button>
          <button
            onClick={() => onConfirm({ description: vendorInput, amount: amountInput })}
            disabled={!vendorInput.trim() || !amountInput}
            className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Use these details
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfidenceBadge({ score }: { score: number | undefined }) {
  if (score === undefined) return <span className="text-[10px] text-muted">not found</span>;
  const level = confidenceLevel(score);
  const label = level === "high" ? "high confidence" : level === "medium" ? "double-check" : "low confidence";
  const color = level === "high" ? "text-brand-text" : level === "medium" ? "text-amber-600" : "text-danger";
  return <span className={`text-[10px] ${color}`}>{label}</span>;
}
