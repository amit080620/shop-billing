"use client";

import { useState, useTransition } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { MessageCircle, Dumbbell } from "lucide-react";
import Link from "next/link";
import { createLeadAction, updateLeadStatusAction, deleteLeadAction } from "@/lib/actions/gym";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { Popup } from "@/app/components/Popup";
import { UserPlus } from "lucide-react";

type Lead = {
  id: string;
  name: string;
  phone: string;
  source: string | null;
  interestedPlan: string | null;
  status: "new" | "contacted" | "trial" | "converted" | "lost";
  notes: string | null;
  createdAt: string;
};

const STATUSES: Lead["status"][] = ["new", "contacted", "trial", "converted", "lost"];
const STATUS_LABELS: Record<string, string> = { new: "New", contacted: "Contacted", trial: "Trial", converted: "Converted", lost: "Lost" };
const STATUS_TONE: Record<string, string> = {
  new: "bg-background text-muted",
  contacted: "bg-brand-soft text-brand-text",
  trial: "bg-credit-soft text-credit",
  converted: "bg-green-100 text-green-700",
  lost: "bg-danger/15 text-danger",
};
const SOURCES = ["Walk-in", "Instagram", "Facebook", "Google", "Referral", "WhatsApp"];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary-sm disabled:opacity-60">
      {pending ? "Saving…" : "+ Add lead"}
    </button>
  );
}

export function LeadsClient({ leads }: { leads: Lead[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [source, setSource] = useState("");
  const [filter, setFilter] = useState<Lead["status"] | "all">("all");
  const [isPending, startTransition] = useTransition();

  const [state, formAction] = useActionState(
    async (prev: { error?: string } | null, formData: FormData) => {
      const result = await createLeadAction(prev, formData);
      if (!result?.error) {
        setShowForm(false);
        setSource("");
        router.refresh();
      }
      return result;
    },
    null,
  );

  const filtered = filter === "all" ? leads : leads.filter((l) => l.status === filter);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Leads"
        subtitle="Trial enquiries and walk-ins — track who to follow up with."
        action={
          <button onClick={() => setShowForm((v) => !v)} className="btn-primary-sm">
            + Lead
          </button>
        }
        icon={<UserPlus size={18} strokeWidth={1.8} />}
      />
      <Link href="/gym/members" className="text-sm text-muted">
        ← Members
      </Link>

      {showForm && (
        <Popup open={showForm} onClose={() => setShowForm(false)} title="Add lead">
        <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-dashed border-brand bg-brand-soft p-4">
          <input name="name" placeholder="Name" required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          <input name="phone" placeholder="Phone number" required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          <input name="interestedPlan" placeholder="Interested plan (optional)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          <input type="hidden" name="source" value={source} />
          <div className="flex flex-wrap gap-1.5">
            {SOURCES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${source === s ? "border-brand bg-surface text-brand-text" : "border-transparent bg-surface/60 text-muted"}`}
              >
                {s}
              </button>
            ))}
          </div>
          {state?.error && <p className="text-sm text-danger">{state.error}</p>}
          <div className="flex gap-2">
            <SubmitButton />
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
              Cancel
            </button>
          </div>
        </form>
        </Popup>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setFilter("all")}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${filter === "all" ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}
        >
          All
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${filter === s ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState text="No leads here." />
      ) : (
        <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
          {filtered.map((lead) => (
            <li key={lead.id} className="neu-card p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{lead.name}</p>
                  <p className="text-xs text-muted">
                    {lead.phone}
                    {lead.source ? ` · ${lead.source}` : ""}
                    {lead.interestedPlan ? ` · ${lead.interestedPlan}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[lead.status]}`}>{STATUS_LABELS[lead.status]}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <select
                  value={lead.status}
                  onChange={(e) =>
                    startTransition(async () => {
                      await updateLeadStatusAction(lead.id, e.target.value as Lead["status"]);
                      router.refresh();
                    })
                  }
                  disabled={isPending}
                  className="rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:border-brand"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
                <a
                  href={`https://wa.me/${lead.phone.replace(/\D/g, "").length === 10 ? `91${lead.phone.replace(/\D/g, "")}` : lead.phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-lg border border-brand bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-text"
                >
                  <MessageCircle size={12} /> WhatsApp
                </a>
                {lead.status === "converted" && (
                  <Link
                    href={`/gym/members/new?memberName=${encodeURIComponent(lead.name)}&memberPhone=${encodeURIComponent(lead.phone)}`}
                    className="flex items-center gap-1 rounded-lg border border-brand bg-brand px-2.5 py-1 text-xs font-medium text-white"
                  >
                    <Dumbbell size={12} /> Sell membership
                  </Link>
                )}
                <button
                  onClick={() => {
                    if (!confirm("Delete this lead?")) return;
                    startTransition(async () => {
                      await deleteLeadAction(lead.id);
                      router.refresh();
                    });
                  }}
                  disabled={isPending}
                  className="ml-auto text-xs text-danger disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
