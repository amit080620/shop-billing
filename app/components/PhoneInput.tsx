"use client";

import { useState } from "react";
import { digitsOnly } from "@/lib/phoneDigits";
import { useT } from "@/lib/i18n/LangContext";

export { digitsOnly };

type ControlledProps = {
  mode?: "controlled";
  value: string;
  onChange: (fullNumber: string) => void;
  name?: undefined;
  defaultValue?: undefined;
};
type UncontrolledProps = {
  mode: "form";
  name: string;
  defaultValue?: string;
  value?: undefined;
  onChange?: undefined;
};

export function PhoneInput(
  props: (ControlledProps | UncontrolledProps) & {
    required?: boolean;
    placeholder?: string;
    className?: string;
    inputRef?: React.RefObject<HTMLInputElement | null>;
  },
) {
  const { t } = useT();
  const { required, placeholder = t("10-digit mobile number"), className, inputRef } = props;

  // Uncontrolled/form mode — a hidden input carries the genuine combined
  // "+91XXXXXXXXXX" value under the given `name`, so a native form
  // (submitted via FormData/server action, the pattern most forms in
  // this app already use) keeps working exactly as before — only the
  // visible split-box UI changes.
  const [localDigits, setLocalDigits] = useState(() =>
    props.mode === "form" ? digitsOnly(props.defaultValue ?? "") : "",
  );

  const digits = props.mode === "form" ? localDigits : digitsOnly(props.value);

  function handleChange(raw: string) {
    const next = raw.replace(/\D/g, "").slice(0, 10);
    if (props.mode === "form") {
      setLocalDigits(next);
    } else {
      props.onChange(`+91${next}`);
    }
  }

  return (
    // One field with a fixed +91 prefix, the way payment apps show it.
    <div
      className={`flex min-w-0 items-center rounded-lg bg-surface shadow-[inset_0_0_0_1px_var(--border-strong)] focus-within:shadow-[inset_0_0_0_1.5px_var(--brand),var(--focus-ring)] ${className ?? ""}`}
    >
      {props.mode === "form" && <input type="hidden" name={props.name} value={digits ? `+91${digits}` : ""} />}
      <span className="shrink-0 border-r border-border py-1 pl-3 pr-2.5 text-sm font-medium text-muted" aria-hidden="true">
        +91
      </span>
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        required={required}
        value={digits}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        maxLength={10}
        className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-sm"
      />
    </div>
  );
}
