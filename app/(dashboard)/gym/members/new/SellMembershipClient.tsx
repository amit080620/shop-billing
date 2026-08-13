"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { sellMembershipAction } from "@/lib/actions/gym";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import type { Lang } from "@/lib/i18n/dictionary";
import { UserPlus } from "lucide-react";

type Plan = { id: string; name: string; durationDays: number; price: number; ptSessionsIncluded: number };
type Member = { id: string; name: string; phone: string };

export function SellMembershipClient({
  lang,
  plans,
  members,
  prefillMemberId,
  prefillMemberName,
  prefillMemberPhone,
}: {
  lang: Lang;
  plans: Plan[];
  members: Member[];
  prefillMemberId: string | null;
  prefillMemberName: string;
  prefillMemberPhone: string;
}) {
  const router = useRouter();
  const [selectedMember, setSelectedMember] = useState<Member | null>(prefillMemberId ? { id: prefillMemberId, name: prefillMemberName, phone: prefillMemberPhone } : null);
  const [memberName, setMemberName] = useState(prefillMemberName);
  const [memberPhone, setMemberPhone] = useState(prefillMemberPhone);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi" | "online" | "other">("cash");
  const [paidAmount, setPaidAmount] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!selectedPlan) {
      setError("Pick a plan");
      return;
    }
    startTransition(async () => {
      const result = await sellMembershipAction({
        memberId: selectedMember?.id ?? null,
        memberName,
        memberPhone,
        planId: selectedPlan.id,
        planName: selectedPlan.name,
        durationDays: selectedPlan.durationDays,
        price: selectedPlan.price,
        ptSessionsIncluded: selectedPlan.ptSessionsIncluded,
        paymentMethod,
        paidAmount: typeof paidAmount === "number" ? paidAmount : selectedPlan.price,
      });
      if (result.error || !result.billId) {
        setError(result.error ?? "Could not sell membership");
        return;
      }
      router.push(`/print/bill/${result.billId}`);
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title="Sell membership"
        icon={<UserPlus size={18} strokeWidth={1.8} />}
      />
      <Link href="/gym/members" className="text-sm text-muted">
        ← Members
      </Link>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Member</p>
        <SearchableSelect
          lang={lang}
          items={members}
          getKey={(m) => m.id}
          getLabel={(m) => m.name}
          getSubLabel={(m) => m.phone}
          onSelect={(m) => {
            setSelectedMember(m);
            setMemberName(m.name);
            setMemberPhone(m.phone);
          }}
          placeholder="Search existing member, or just type below for a new one"
        />
        <div className="grid grid-cols-2 gap-3">
          <input value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="Name" className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
          <input value={memberPhone} onChange={(e) => setMemberPhone(e.target.value)} placeholder="Phone" className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand" />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Plan</p>
        {plans.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-4 text-center text-sm text-muted">
            No active plans —{" "}
            <Link href="/gym/plans" className="text-brand">
              add one first
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {plans.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedPlan(p);
                  setPaidAmount(p.price);
                }}
                className={`flex items-center justify-between rounded-lg border px-3.5 py-3 text-left ${
                  selectedPlan?.id === p.id ? "border-brand bg-brand-soft" : "border-border bg-surface"
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{p.name}</p>
                  <p className="text-xs text-muted">
                    {p.durationDays} days{p.ptSessionsIncluded > 0 ? ` · ${p.ptSessionsIncluded} PT sessions` : ""}
                  </p>
                </div>
                <p className="text-sm font-semibold text-foreground">{formatMoney(p.price)}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedPlan && (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-sm font-medium text-foreground">Payment</p>
          <div className="grid grid-cols-2 gap-3">
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)} className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
              <option value="online">Online</option>
              <option value="other">Other</option>
            </select>
            <input
              type="number"
              min={0}
              max={selectedPlan.price}
              step="0.01"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Amount paid"
              className="rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
          <p className="text-xs text-muted">Total: {formatMoney(selectedPlan.price)} (incl. 18% GST) — leave blank to mark fully paid.</p>
        </section>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      <button onClick={submit} disabled={isPending || !selectedPlan} className="btn-primary w-full text-center disabled:opacity-60">
        {isPending ? "Processing…" : "Sell & generate invoice"}
      </button>
    </div>
  );
}
