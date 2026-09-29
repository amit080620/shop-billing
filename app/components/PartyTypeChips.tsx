import Link from "next/link";

export type PartyType = "all" | "b2b" | "b2c";

/** Reads `?type=` — B2B (billed to a GSTIN) or B2C (everyone else). */
export function parsePartyType(value: string | undefined): PartyType {
  return value === "b2b" || value === "b2c" ? value : "all";
}

/** All / B2B / B2C filter pills for a bill list. Keeps the page's other filters (dates, search). */
export function PartyTypeChips({
  basePath,
  params,
  current,
  labels,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  current: PartyType;
  labels: { all: string; b2b: string; b2c: string };
}) {
  const hrefFor = (type: PartyType) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "type") q.set(k, v);
    if (type !== "all") q.set("type", type);
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <div role="group" className="flex gap-2">
      {(["all", "b2b", "b2c"] as const).map((type) => (
        <Link
          key={type}
          href={hrefFor(type)}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${current === type ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"}`}
        >
          {labels[type]}
        </Link>
      ))}
    </div>
  );
}
