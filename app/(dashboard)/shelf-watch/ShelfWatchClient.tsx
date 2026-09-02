"use client";

import { useRef, useState } from "react";
import { Plus, Camera, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { createShelfWatchAction, checkShelfPhotoAction, type ShelfWatch, type ShelfChange } from "@/lib/actions/shelfWatch";
import { fileToBase64 } from "@/lib/fileToBase64";

export function ShelfWatchClient({ initialShelves }: { initialShelves: ShelfWatch[] }) {
  const [shelves, setShelves] = useState(initialShelves);
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [activeShelfId, setActiveShelfId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [results, setResults] = useState<Record<string, ShelfChange[] | "none" | "first">>({});
  const [error, setError] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function addShelf() {
    if (!newName.trim()) return;
    setIsCreating(true);
    const result = await createShelfWatchAction(newName.trim());
    setIsCreating(false);
    if (result.error || !result.id) {
      setError(result.error ?? "Nahi ban paya");
      return;
    }
    setShelves((prev) => [{ id: result.id!, name: newName.trim(), photoUrl: null, lastCheckedAt: new Date().toISOString() }, ...prev]);
    setNewName("");
  }

  async function handlePhoto(shelfId: string, wasFirstPhoto: boolean, file: File | undefined) {
    if (!file) return;
    setActiveShelfId(shelfId);
    setIsChecking(true);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const result = await checkShelfPhotoAction(shelfId, base64, file.type || "image/jpeg");
      if (result.error === "not_configured") {
        setError("Iske liye free Gemini AI key set up karni hogi (Settings).");
        return;
      }
      if (result.error) {
        setError(result.error);
        return;
      }
      setResults((prev) => ({ ...prev, [shelfId]: wasFirstPhoto ? "first" : result.changes && result.changes.length > 0 ? result.changes : "none" }));
      setShelves((prev) => prev.map((s) => (s.id === shelfId ? { ...s, lastCheckedAt: new Date().toISOString() } : s)));
    } catch {
      setError("Photo process nahi ho payi — dobara try karein.");
    } finally {
      setIsChecking(false);
      setActiveShelfId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="neu-card flex flex-col gap-2 p-4">
        <p className="text-sm text-foreground">
          Har shelf/section ka ek naam dein (jaise &quot;Grocery Rack 1&quot;). Har baar jab uski photo lenge, AI pichli photo se compare karke batayega
          kya kam dikh raha hai — bina kuch type kiye.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Naya shelf ka naam (jaise Grocery Rack 1)"
          className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button onClick={addShelf} disabled={isCreating || !newName.trim()} className="btn-primary flex items-center gap-1.5 px-3 disabled:opacity-60">
          {isCreating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <ul className="flex flex-col gap-3">
        {shelves.map((shelf) => {
          const result = results[shelf.id];
          const isThisChecking = isChecking && activeShelfId === shelf.id;
          return (
            <li key={shelf.id} className="neu-card flex flex-col gap-2.5 p-3.5">
              <div className="flex items-center gap-3">
                {shelf.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external Supabase storage URL, not a local/optimizable asset
                  <img src={shelf.photoUrl} alt={shelf.name} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface text-muted">
                    <Camera size={18} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{shelf.name}</p>
                  <p className="text-xs text-muted">{shelf.photoUrl ? `Last check: ${new Date(shelf.lastCheckedAt).toLocaleDateString()}` : "Abhi tak photo nahi hai"}</p>
                </div>
                <input
                  ref={(el) => {
                    fileInputs.current[shelf.id] = el;
                  }}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    handlePhoto(shelf.id, !shelf.photoUrl, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileInputs.current[shelf.id]?.click()}
                  disabled={isThisChecking}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-brand px-2.5 py-1.5 text-xs font-medium text-brand disabled:opacity-60"
                >
                  {isThisChecking ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                  {isThisChecking ? "Check ho raha hai…" : "Photo"}
                </button>
              </div>

              {result === "first" && (
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <CheckCircle2 size={13} /> Pehli photo save ho gayi — agli baar se comparison shuru hoga.
                </p>
              )}
              {result === "none" && (
                <p className="flex items-center gap-1.5 text-xs text-success">
                  <CheckCircle2 size={13} /> Kuch bhi genuinely kam nahi dikh raha — sab theek lagta hai.
                </p>
              )}
              {Array.isArray(result) && (
                <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-credit bg-credit-soft p-2.5">
                  {result.map((c, i) => (
                    <p key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0 text-credit" />
                      <span>
                        <span className="font-medium">{c.item}</span> — {c.observation}
                      </span>
                    </p>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {shelves.length === 0 && <p className="py-6 text-center text-sm text-muted">Abhi koi shelf add nahi ki — upar naam likh kar shuru karein.</p>}
    </div>
  );
}
