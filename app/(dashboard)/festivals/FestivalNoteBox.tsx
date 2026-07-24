"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveFestivalNoteAction } from "@/lib/actions/festival-notes";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary-sm self-start disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save note"}
    </button>
  );
}

export function FestivalNoteBox({ slug, initialNote }: { slug: string; initialNote: string }) {
  const [state, formAction] = useActionState(saveFestivalNoteAction, null);
  const [value, setValue] = useState(initialNote);

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
      <input type="hidden" name="slug" value={slug} />
      <label className="text-xs font-medium text-foreground">
        📝 Your notes for this festival — what worked, what to remember for next time
      </label>
      <textarea
        name="note"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="e.g. Kaju katli and dry-fruit boxes sold out fast last year — order double this time. Customer X always wants 2kg extra ghee."
        className="rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-brand"
      />
      <div className="flex items-center gap-2">
        <SaveButton />
        {state?.saved && <span className="text-xs text-brand">Saved ✓</span>}
        {state?.error && <span className="text-xs text-credit">{state.error}</span>}
      </div>
    </form>
  );
}
