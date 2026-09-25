"use client";

import { keepValuesOnError } from "@/lib/keepValuesOnError";
import { useState, useTransition } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { createLabTestAction, toggleLabTestActiveAction, deleteLabTestAction, createLabPackageAction, deleteLabPackageAction } from "@/lib/actions/lab";
import { useToast } from "@/app/components/Toast";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/app/components/PageHeader";
import { EmptyState } from "@/app/components/EmptyState";
import { TestTube } from "lucide-react";
import { useT } from "@/lib/i18n/LangContext";
import { BackLink } from "@/app/components/BackLink";

type Test = { id: string; name: string; category: string | null; sampleType: string; price: number; gstPercent: number; turnaroundHours: number; referenceRange: string | null; unit: string | null; isActive: boolean };
type Package = { id: string; name: string; price: number; isActive: boolean; testNames: string[] };

function SubmitButton({ label, t }: { label: string; t: (key: string) => string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary-sm disabled:opacity-60">
      {pending ? t("products.saving") : label}
    </button>
  );
}

export function TestsClient({ tests, packages }: { tests: Test[]; packages: Package[] }) {
  const { t } = useT();
  const router = useRouter();
  const [tab, setTab] = useState<"tests" | "packages">("tests");
  const [showTestForm, setShowTestForm] = useState(false);
  const [showPackageForm, setShowPackageForm] = useState(false);
  const [packageName, setPackageName] = useState("");
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { showToast } = useToast();

  const [testState, testFormAction] = useActionState(
    keepValuesOnError(async (prev: { error?: string } | null, formData: FormData) => {
      const result = await createLabTestAction(prev, formData);
      if (!result?.error) {
        setShowTestForm(false);
        showToast(t("Test added"));
        router.refresh();
      }
      return result;
    }),
    null,
  );

  function savePackage() {
    startTransition(async () => {
      const result = await createLabPackageAction(packageName, selectedTestIds);
      if (result.error) {
        setPackageError(result.error);
        return;
      }
      setShowPackageForm(false);
      setPackageName("");
      setSelectedTestIds([]);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback="/lab/orders" />
      <PageHeader
        title={t("Test catalog")}
        icon={<TestTube size={18} strokeWidth={1.8} />}
      />

      <div className="flex gap-2">
        <button onClick={() => setTab("tests")} className={`rounded-full border px-3.5 py-1.5 text-xs font-medium ${tab === "tests" ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
          {t("Individual tests")}
        </button>
        <button onClick={() => setTab("packages")} className={`rounded-full border px-3.5 py-1.5 text-xs font-medium ${tab === "packages" ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}>
          {t("Packages/Profiles")}
        </button>
      </div>

      {tab === "tests" && (
        <>
          <button onClick={() => setShowTestForm((v) => !v)} className="btn-primary-sm self-start">
            + {t("Test")}
          </button>
          {showTestForm && (
            <form action={testFormAction} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
              <input name="name" placeholder={t("Test name (e.g. CBC, Blood Sugar Fasting)")} required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
              <input name="category" placeholder={t("Category (optional, e.g. Hematology)")} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
              <div className="grid grid-cols-2 gap-2">
                <select name="sampleType" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand">
                  <option value="blood">{t("Blood")}</option>
                  <option value="urine">{t("Urine")}</option>
                  <option value="stool">{t("Stool")}</option>
                  <option value="swab">{t("Swab")}</option>
                  <option value="other">{t("Other")}</option>
                </select>
                <input name="turnaroundHours" type="number" min="1" defaultValue={24} placeholder={t("TAT (hours)")} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input name="price" type="number" min="0" step="0.01" placeholder={t("Price (₹)")} required className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
                <input name="gstPercent" type="number" min="0" step="0.01" placeholder={t("products.gstPercent")} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input name="referenceRange" placeholder={t("Reference range (e.g. 70-100)")} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
                <input name="unit" placeholder={t("Unit (e.g. mg/dL)")} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
              </div>
              <p className="text-xs text-muted">{t("Reference range shows on the report next to the result — same as any printed lab report. Nothing is auto-interpreted.")}</p>
              {testState?.error && <p className="text-sm text-danger">{testState.error}</p>}
              <div className="flex gap-2">
                <SubmitButton label={t("+ Add test")} t={t} />
                <button type="button" onClick={() => setShowTestForm(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          )}

          {tests.length === 0 ? (
            <EmptyState text={t("No tests yet — add your first one.")} />
          ) : (
            <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
              {tests.map((test) => (
                <li key={test.id} className={`neu-card px-3.5 py-3 ${deletingId === test.id ? "animate-delete" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{test.name}</p>
                      <p className="text-xs text-muted">
                        {test.category ? `${test.category} · ` : ""}
                        {test.sampleType} · {formatMoney(test.price)} · {t("TAT {n}h", { n: test.turnaroundHours })}
                        {test.referenceRange ? ` · ${t("Range: {range}{unit}", { range: test.referenceRange, unit: test.unit ? ` ${test.unit}` : "" })}` : ""}
                      </p>
                      {!test.isActive && <span className="mt-1 inline-block rounded-full bg-danger/15 px-2 py-0.5 text-[11px] text-danger">{t("Inactive")}</span>}
                    </div>
                    <div className="flex shrink-0 gap-2 text-xs">
                      <button
                        onClick={() =>
                          startTransition(async () => {
                            await toggleLabTestActiveAction(test.id, !test.isActive);
                            router.refresh();
                          })
                        }
                        disabled={isPending}
                        className="font-medium text-muted disabled:opacity-50"
                      >
                        {test.isActive ? t("Deactivate") : t("Activate")}
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm(t('Delete "{name}"?', { name: test.name }))) return;
                          setDeletingId(test.id);
                          startTransition(async () => {
                            await deleteLabTestAction(test.id);
                            showToast(t("Test deleted"), "info");
                            router.refresh();
                          });
                        }}
                        disabled={isPending}
                        className="font-medium text-danger disabled:opacity-50"
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "packages" && (
        <>
          <button onClick={() => setShowPackageForm((v) => !v)} className="btn-primary-sm self-start">
            + {t("Package")}
          </button>
          {showPackageForm && (
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
              <input value={packageName} onChange={(e) => setPackageName(e.target.value)} placeholder={t("Package name (e.g. Full Body Checkup)")} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
              <p className="text-xs text-muted">{t("Pick tests to include — price is the sum of selected tests, editable later from the tests themselves.")}</p>
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                {tests.filter((test) => test.isActive).map((test) => (
                  <label key={test.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedTestIds.includes(test.id)}
                      onChange={(e) => setSelectedTestIds((prev) => (e.target.checked ? [...prev, test.id] : prev.filter((id) => id !== test.id)))}
                      className="h-3.5 w-3.5 rounded border-border"
                    />
                    {test.name} — {formatMoney(test.price)}
                  </label>
                ))}
              </div>
              {packageError && <p className="text-xs text-danger">{packageError}</p>}
              <div className="flex gap-2">
                <button onClick={savePackage} disabled={isPending} className="btn-primary-sm disabled:opacity-60">
                  {isPending ? t("products.saving") : t("Save package")}
                </button>
                <button onClick={() => setShowPackageForm(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          )}

          {packages.length === 0 ? (
            <EmptyState text={t("No packages yet.")} />
          ) : (
            <ul className="flex flex-col gap-2">
              {packages.map((p) => (
                <li key={p.id} className="neu-card px-3.5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.name}</p>
                      <p className="text-xs text-muted">
                        {formatMoney(p.price)} · {t("{n} tests", { n: p.testNames.length })}: {p.testNames.join(", ")}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (!confirm(t('Delete "{name}"?', { name: p.name }))) return;
                        startTransition(async () => {
                          await deleteLabPackageAction(p.id);
                          router.refresh();
                        });
                      }}
                      disabled={isPending}
                      className="shrink-0 text-xs font-medium text-danger disabled:opacity-50"
                    >
                      {t("common.delete")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
