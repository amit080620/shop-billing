"use client";

import { Cake, MessageCircle } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/whatsapp";

type BirthdayCustomer = {
  id: string;
  name: string;
  phone: string;
  daysAway: number;
  dateLabel: string;
};

export function BirthdayRow({
  customer,
  shopName,
  isToday = false,
}: {
  customer: BirthdayCustomer;
  shopName: string;
  isToday?: boolean;
}) {
  function greet() {
    const message = isToday
      ? `Happy birthday, ${customer.name}! 🎉 Wishing you a wonderful year ahead — from all of us at ${shopName}.`
      : `Hi ${customer.name}, wishing you an early happy birthday from ${shopName}! 🎉`;
    window.open(buildWhatsAppLink(customer.phone, message), "_blank");
  }

  return (
    <li className="neu-card flex items-center justify-between gap-3 px-3.5 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-text"
          style={{ boxShadow: "-2px -2px 5px var(--neu-light), 2px 2px 5px var(--neu-dark)" }}
        >
          <Cake size={16} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{customer.name}</p>
          <p className="text-xs text-muted">
            {isToday ? "Today 🎂" : `${customer.dateLabel} · in ${customer.daysAway} day${customer.daysAway === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>
      <button
        onClick={greet}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-medium text-white"
      >
        <MessageCircle size={13} /> Wish
      </button>
    </li>
  );
}
