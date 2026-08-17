"use client";

import { useEffect, useState, useTransition } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import {
  listProductOptionsAction,
  createOptionGroupAction,
  deleteOptionGroupAction,
  createOptionChoiceAction,
  deleteOptionChoiceAction,
  type OptionGroup,
} from "@/lib/actions/product-options";

export function ProductOptionsManager({
  productId,
  productName,
  onClose,
}: {
  productId: string;
  productName: string;
  onClose: () => void;
}) {
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [deletingChoiceId, setDeletingChoiceId] = useState<string | null>(null);

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupRequired, setNewGroupRequired] = useState(true);
  const [newGroupMulti, setNewGroupMulti] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);

  const [newChoiceName, setNewChoiceName] = useState<Record<string, string>>({});
  const [newChoicePrice, setNewChoicePrice] = useState<Record<string, string>>({});

  function reload() {
    setLoading(true);
    listProductOptionsAction(productId).then((g) => {
      setGroups(g);
      setLoading(false);
    });
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  function handleAddGroup() {
    if (!newGroupName.trim()) return;
    startTransition(async () => {
      const result = await createOptionGroupAction(productId, newGroupName, newGroupRequired, newGroupMulti);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNewGroupName("");
      setShowNewGroup(false);
      reload();
    });
  }

  function handleDeleteGroup(groupId: string) {
    setDeletingGroupId(groupId);
    startTransition(async () => {
      await deleteOptionGroupAction(groupId);
      reload();
    });
  }

  function handleAddChoice(groupId: string) {
    const name = newChoiceName[groupId];
    if (!name?.trim()) return;
    const price = Number(newChoicePrice[groupId] || 0);
    startTransition(async () => {
      const result = await createOptionChoiceAction(groupId, name, price);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNewChoiceName((prev) => ({ ...prev, [groupId]: "" }));
      setNewChoicePrice((prev) => ({ ...prev, [groupId]: "" }));
      reload();
    });
  }

  function handleDeleteChoice(choiceId: string, groupId: string) {
    setDeletingChoiceId(choiceId);
    startTransition(async () => {
      await deleteOptionChoiceAction(choiceId, groupId);
      reload();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="ray-pop flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-surface sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Item options</p>
            <p className="text-xs text-muted">{productName}</p>
          </div>
          <button onClick={onClose} aria-label="Close">
            <X size={18} className="text-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted">Loading…</p>
          ) : (
            <>
              {groups.length === 0 && !showNewGroup && (
                <p className="py-4 text-center text-sm text-muted">
                  No options yet. Add one below — e.g. &quot;Beverage&quot; with choices Lassi / Chaas.
                </p>
              )}

              <div className="flex flex-col gap-3">
                {groups.map((g) => (
                  <div key={g.id} className={`rounded-lg border border-border p-3 ${deletingGroupId === g.id ? "animate-delete" : ""}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{g.name}</p>
                        <p className="text-[11px] text-muted">
                          {g.isRequired ? "Required" : "Optional"} · {g.isMultiSelect ? "Multi-select" : "Single-select"}
                        </p>
                      </div>
                      <button onClick={() => handleDeleteGroup(g.id)} disabled={isPending} aria-label="Remove group">
                        <Trash2 size={14} className="text-danger" />
                      </button>
                    </div>

                    <div className="mt-2 flex flex-col gap-1">
                      {g.choices.map((c) => (
                        <div key={c.id} className={`flex items-center justify-between rounded-lg bg-background px-2.5 py-1.5 ${deletingChoiceId === c.id ? "animate-delete" : ""}`}>
                          <span className="text-sm text-foreground">
                            {c.name} {c.isDefault && <span className="text-[10px] text-muted">(default)</span>}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted">
                              {c.extraPrice > 0 ? `+₹${c.extraPrice}` : "Included"}
                            </span>
                            <button onClick={() => handleDeleteChoice(c.id, g.id)} disabled={isPending} aria-label="Remove choice">
                              <X size={12} className="text-muted" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 flex gap-1.5">
                      <input
                        value={newChoiceName[g.id] ?? ""}
                        onChange={(e) => setNewChoiceName((prev) => ({ ...prev, [g.id]: e.target.value }))}
                        placeholder="Choice name"
                        className="flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-brand"
                      />
                      <input
                        value={newChoicePrice[g.id] ?? ""}
                        onChange={(e) => setNewChoicePrice((prev) => ({ ...prev, [g.id]: e.target.value }))}
                        type="number"
                        min={0}
                        placeholder="+₹"
                        className="w-16 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-brand"
                      />
                      <button
                        onClick={() => handleAddChoice(g.id)}
                        disabled={isPending}
                        className="rounded-lg border border-brand px-2.5 py-1.5 text-xs font-medium text-brand-text"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {showNewGroup ? (
                <div className="mt-3 flex flex-col gap-2 rounded-lg border border-dashed border-brand bg-brand-soft p-3">
                  <input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Group name — e.g. Beverage"
                    className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
                  />
                  <div className="flex gap-3 text-xs text-foreground">
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={newGroupRequired} onChange={(e) => setNewGroupRequired(e.target.checked)} />
                      Required
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={newGroupMulti} onChange={(e) => setNewGroupMulti(e.target.checked)} />
                      Multi-select
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleAddGroup} disabled={isPending} className="btn-primary-sm flex-1">
                      Add group
                    </button>
                    <button onClick={() => setShowNewGroup(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewGroup(true)}
                  className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted"
                >
                  <Plus size={12} /> Add option group
                </button>
              )}

              {error && <p className="mt-2 text-xs text-danger">{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
