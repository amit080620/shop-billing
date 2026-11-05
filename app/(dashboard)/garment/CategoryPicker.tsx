"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";
import { addCategoryAction } from "@/lib/actions/products";

const NEW = "__new";
type Category = { id: string; name: string };

/** A garment style's category: the shop's categories, and "+ New category" to make one right here
 * and select it. `name` submits the choice with a form; `onCreated` tells a parent that outlives
 * this picker. While adding it takes the grid's full width (both forms lay it out in two columns). */
export function CategoryPicker({
  categories,
  value,
  onChange,
  onCreated,
  name,
  className,
}: {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  onCreated?: (category: Category) => void;
  name?: string;
  className: string;
}) {
  const { t } = useT();
  const [added, setAdded] = useState<Category[]>([]);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const list = [...categories, ...added.filter((a) => !categories.some((c) => c.id === a.id))].sort((a, b) => a.name.localeCompare(b.name));

  function add() {
    const clean = text.trim();
    if (!clean || pending) return;
    setError(null);
    start(async () => {
      const r = await addCategoryAction(clean).catch(() => ({ error: "Couldn't add the category.", category: undefined }));
      const made = r.category;
      if (!made) {
        setError(t(r.error ?? "Couldn't add the category."));
        return;
      }
      setAdded((a) => [...a, made]);
      onCreated?.(made);
      onChange(made.id);
      setText("");
      setAdding(false);
    });
  }

  return (
    <div className={`flex min-w-0 flex-col gap-1 ${adding ? "col-span-2" : ""}`}>
      {name && <input type="hidden" name={name} value={value} />}
      {adding ? (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter adds the category; it must never submit the form this sits in.
              if (e.key !== "Enter") return;
              e.preventDefault();
              add();
            }}
            maxLength={60}
            placeholder={t("New category name")}
            aria-label={t("New category name")}
            className={`${className} min-w-0 flex-1`}
          />
          <button type="button" onClick={add} disabled={pending || !text.trim()} className="btn-primary-sm shrink-0 disabled:opacity-50">
            {pending ? t("Adding…") : t("Add")}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setText("");
              setError(null);
            }}
            aria-label={t("Cancel")}
            className="shrink-0 p-1 text-muted"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <select
          value={value}
          onChange={(e) => {
            if (e.target.value === NEW) setAdding(true);
            else onChange(e.target.value);
          }}
          className={className}
          aria-label={t("Garment category")}
        >
          <option value="">{t("No category")}</option>
          {list.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={NEW}>{t("+ New category")}</option>
        </select>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
