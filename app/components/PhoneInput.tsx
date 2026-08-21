"use client";

import { useState } from "react";
import { digitsOnly } from "@/lib/phoneDigits";

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
  const { required, placeholder = "10-digit mobile number", className, inputRef } = props;

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
    <div className={`flex gap-1.5 ${className ?? ""}`}>
      {props.mode === "form" && <input type="hidden" name={props.name} value={digits ? `+91${digits}` : ""} />}
      <span
        className="flex shrink-0 items-center rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted"
        aria-hidden="true"
      >
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
        className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand"
      />
    </div>
  );
}
