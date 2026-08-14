"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Check, X, Info } from "lucide-react";

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; message: string; tone: ToastTone };

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = toast.tone === "success" ? Check : toast.tone === "error" ? X : Info;
  const tone =
    toast.tone === "success"
      ? "border-brand bg-brand text-white"
      : toast.tone === "error"
        ? "border-danger bg-danger text-white"
        : "border-border bg-surface text-foreground";

  return (
    <div
      onClick={onDismiss}
      className={`toast-enter pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${tone}`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20"><Icon size={12} strokeWidth={3} /></span>
      <span className="min-w-0">{toast.message}</span>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
