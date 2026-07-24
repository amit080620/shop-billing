"use client";

import { useEffect, useState } from "react";

// The Contact Picker API isn't in TypeScript's built-in lib types yet.
interface ContactProperty {
  name?: string[];
  tel?: string[];
}
interface ContactsManager {
  select: (
    properties: string[],
    options?: { multiple?: boolean },
  ) => Promise<ContactProperty[]>;
}

export function ContactPickerButton({
  onPick,
  label = "📱 Pick from contacts",
}: {
  onPick: (name: string, phone: string) => void;
  label?: string;
}) {
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
        "contacts" in navigator &&
        typeof (navigator as unknown as { contacts?: ContactsManager }).contacts?.select ===
          "function",
    );
  }, []);

  if (!supported) return null;

  async function pick() {
    try {
      const contactsApi = (navigator as unknown as { contacts: ContactsManager }).contacts;
      const contacts = await contactsApi.select(["name", "tel"], { multiple: false });
      const contact = contacts?.[0];
      if (!contact) return; // user cancelled the picker

      const name = contact.name?.[0]?.trim() ?? "";
      // Contacts often store numbers with country code/spaces/dashes — keep
      // just the last 10 digits, which is what the rest of the app expects.
      const rawPhone = contact.tel?.[0] ?? "";
      const phone = rawPhone.replace(/\D/g, "").slice(-10);

      onPick(name, phone);
    } catch {
      // Permission denied or picker dismissed — nothing to do.
    }
  }

  return (
    <button
      type="button"
      onClick={pick}
      className="self-start text-sm font-medium text-brand"
    >
      {label}
    </button>
  );
}
