"use client";

import { useEffect, useState } from "react";
import { APP_DOWNLOAD_URL, isNativeApp } from "@/lib/nativeApp";
import { useT } from "@/lib/i18n/LangContext";

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

/** Fills name and phone from the phone's contact list: Chrome on Android has
 * the Contact Picker API, and the Android app (1.0.4+) provides the same API
 * natively. Older app installs get the button too, with a nudge to update. */
export function ContactPickerButton({
  onPick,
  label = "Pick from contacts",
}: {
  onPick: (name: string, phone: string) => void;
  label?: string;
}) {
  const { t } = useT();
  const [supported, setSupported] = useState(false);
  const [oldApp, setOldApp] = useState(false);
  const [askUpdate, setAskUpdate] = useState(false);

  useEffect(() => {
    const ok =
      typeof navigator !== "undefined" &&
      "contacts" in navigator &&
      typeof (navigator as unknown as { contacts?: ContactsManager }).contacts?.select === "function";
    setSupported(ok);
    setOldApp(!ok && isNativeApp());
  }, []);

  if (!supported && !oldApp) return null;

  if (oldApp) {
    return askUpdate ? (
      <p className="text-xs text-muted">
        {t("Update the app to pick from contacts.")}{" "}
        <a href={APP_DOWNLOAD_URL} className="font-semibold text-brand underline">
          {t("Update")}
        </a>
      </p>
    ) : (
      <button type="button" onClick={() => setAskUpdate(true)} className="self-start text-sm font-medium text-brand">
        {t(label)}
      </button>
    );
  }

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
      {t(label)}
    </button>
  );
}
