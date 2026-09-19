"use client";

/** React 19 resets a <form action={…}> after every action — including one
 * that returns { error }, which wiped everything a person had typed the
 * moment the server rejected it (e.g. one wrong GSTIN digit cleared the
 * whole product form).
 *
 * React resets through form.reset(), whose "reset" event can be cancelled.
 * Wrap a useActionState action with keepValuesOnError(): when it returns an
 * error, the reset that follows for the form that was just submitted is
 * cancelled, so the fields keep their values. Successful submissions still
 * reset as before. useFormStatus keeps working because the form still
 * submits through its action. */

let lastSubmitted: EventTarget | null = null;
let keepNextReset = false;

if (typeof document !== "undefined") {
  document.addEventListener("submit", (e) => (lastSubmitted = e.target), true);
  document.addEventListener(
    "reset",
    (e) => {
      if (keepNextReset && e.target === lastSubmitted) e.preventDefault();
      keepNextReset = false;
    },
    true,
  );
}

// Returns the same function type it's given, so useActionState infers
// exactly what it did before wrapping.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function keepValuesOnError<F extends (state: any, payload: any) => unknown>(action: F): F {
  const wrapped = async (state: unknown, payload: unknown) => {
    const result = await action(state, payload);
    keepNextReset = !!result && typeof result === "object" && "error" in result && !!(result as { error?: unknown }).error;
    return result;
  };
  return wrapped as unknown as F;
}
