/** The garment trade's rules that need no database: names, sizes, the next steps a document may
 * take, GST flags for moving goods, financial years and what a refused stock move means in plain
 * words. The postings themselves are SQL functions (migration 0063); these mirror their rules for
 * the screens and are tested on their own (lib/__tests__/garmentRules.test.ts). */

export const GODOWN_KINDS = ["main", "branch", "shop_floor", "warehouse", "transit"] as const;
export type GodownKind = (typeof GODOWN_KINDS)[number];
export const GODOWN_KIND_LABEL: Record<GodownKind, string> = {
  main: "Main godown",
  branch: "Branch godown",
  shop_floor: "Shop floor",
  warehouse: "Warehouse",
  transit: "Transit location",
};

export const TRANSFER_STATUS_LABEL = {
  draft: "Draft",
  requested: "Requested",
  approved: "Approved",
  dispatched: "In transit",
  partially_received: "Partly received",
  received: "Received",
  closed: "Closed",
  cancelled: "Cancelled",
} as const;
export type TransferStatus = keyof typeof TRANSFER_STATUS_LABEL;

/** Every garment register's status, as a person reads it (transfers have their own words above). */
export const STATUS_LABEL: Record<string, string> = {
  ...TRANSFER_STATUS_LABEL,
  reported: "Reported",
  under_review: "Under review",
  rejected: "Rejected",
  dispositioned: "Decided",
  investigation: "Under investigation",
  reviewed: "Reviewed",
  adjusted: "Stock adjusted",
  counting: "Counting",
  submitted: "Submitted",
  posted: "Posted",
  carried_forward: "Carried forward",
};

/** How a stock difference was settled. */
export const RESOLUTION_LABEL: Record<string, string> = {
  written_off: "Written off",
  found: "Found — back in stock",
  recovered: "Recovered",
  other: "Other outcome",
};

/** The kinds of stock a godown line can hold. */
export const BUCKET_LABEL: Record<string, string> = { saleable: "Saleable", damaged: "Damaged", transit: "In transit", pending: "Transit shortage" };

/** Each stock-ledger movement (inventory_ledger.kind, as the migration 0063 functions write it). */
export const MOVEMENT_LABEL: Record<string, string> = {
  opening_adjust: "Opening stock",
  move: "Moved",
  put_away: "Put away",
  return_to_godown: "Back to godown",
  transfer_dispatch: "Transfer sent",
  transfer_receive: "Transfer received",
  transfer_receive_damaged: "Arrived damaged",
  transfer_shortage: "Transit shortage",
  shortage_settled: "Shortage settled",
  shortage_found: "Shortage found",
  damage: "Damaged",
  damage_back_to_saleable: "Damage → saleable",
  damage_writeoff: "Written off",
  discrepancy_adjust: "Difference adjusted",
  count_adjust: "Count adjusted",
  purchase_return: "Returned to supplier",
  purchase: "Purchase received",
  customer_return: "Customer return → godown",
  customer_return_damaged: "Customer return damaged",
  opening_balance: "Year opening (record only)",
};

/** Where a customer-returned piece goes from the shop floor (return_disposition_post). */
export type ReturnDisposition = "keep" | "to_godown" | "damaged" | "inspection" | "repair";
export const RETURN_DISPOSITION_LABEL: Record<ReturnDisposition, string> = {
  keep: "Keep on the shop floor",
  to_godown: "Send to a godown",
  damaged: "Damaged",
  inspection: "Hold for inspection",
  repair: "Send for repair",
};

export type TransferAction = "request" | "approve" | "cancel" | "dispatch" | "receive" | "close";

/** What may be done to a transfer next, the way transfer_action / transfer_dispatch /
 * transfer_receive / transfer_close allow it. With approval off, a draft can go straight out. */
export function transferActions(status: TransferStatus, approvalOn: boolean): TransferAction[] {
  switch (status) {
    case "draft":
      return approvalOn ? ["request", "cancel"] : ["dispatch", "cancel"];
    case "requested":
      return approvalOn ? ["approve", "cancel"] : ["dispatch", "cancel"];
    case "approved":
      return ["dispatch", "cancel"];
    case "dispatched":
    case "partially_received":
      return ["receive", "close"];
    case "received":
      return ["close"];
    default:
      return [];
  }
}

/** Still on the way for a transfer line: sent, less received, damaged on arrival and shortage. */
export function pendingOf(line: { dispatched: number; received: number; damaged: number; shortage: number }): number {
  return Math.max(0, round3(line.dispatched - line.received - line.damaged - line.shortage));
}

export const DAMAGE_REASONS = ["manufacturing_defect", "torn", "stained", "colour_damage", "water_damage", "packaging_damage", "customer_return_damage", "handling_damage", "other"] as const;
export type DamageReason = (typeof DAMAGE_REASONS)[number];
export const DAMAGE_REASON_LABEL: Record<DamageReason, string> = {
  manufacturing_defect: "Manufacturing defect",
  torn: "Torn / ripped",
  stained: "Stained",
  colour_damage: "Colour damage",
  water_damage: "Water damage",
  packaging_damage: "Packaging damage",
  customer_return_damage: "Customer return damage",
  handling_damage: "Handling damage",
  other: "Other",
};
export const DAMAGE_DISPOSITIONS = ["repair", "discounted_sale", "scrap", "non_saleable", "return_to_supplier", "other"] as const;
export type DamageDisposition = (typeof DAMAGE_DISPOSITIONS)[number];
export const DAMAGE_DISPOSITION_LABEL: Record<DamageDisposition, string> = {
  repair: "Repaired — back to saleable",
  discounted_sale: "Sell at a discount — back to saleable",
  scrap: "Scrap / write off",
  non_saleable: "Keep as non-saleable",
  return_to_supplier: "Return to supplier",
  other: "Other",
};

export const DISCREPANCY_KINDS = ["missing", "count_shortage", "theft", "unexplained", "transit_shortage", "handling_loss", "count_difference"] as const;
export type DiscrepancyKind = (typeof DISCREPANCY_KINDS)[number];
export const DISCREPANCY_KIND_LABEL: Record<DiscrepancyKind, string> = {
  missing: "Missing stock",
  count_shortage: "Physical count shortage",
  theft: "Theft",
  unexplained: "Unexplained difference",
  transit_shortage: "Transit shortage",
  handling_loss: "Warehouse handling loss",
  count_difference: "Inventory count difference",
};

/** The step a register entry is at → what may be done next (discrepancy_action). */
export function discrepancyActions(status: string, kind: DiscrepancyKind): string[] {
  if (status === "reported") return kind === "transit_shortage" ? ["investigate", "review"] : ["investigate", "review", "reject"];
  if (status === "investigation") return kind === "transit_shortage" ? ["review"] : ["review", "reject"];
  if (status === "reviewed") return kind === "transit_shortage" ? ["approve"] : ["approve", "reject"];
  if (status === "approved") return ["adjust"];
  if (status === "adjusted" || status === "rejected") return ["close"];
  return [];
}

export function damageActions(status: string): string[] {
  if (status === "reported") return ["review", "approve", "reject"];
  if (status === "under_review") return ["approve", "reject"];
  if (status === "approved") return ["dispose"];
  return [];
}

// ─── Sizes and variants ─────────────────────────────────────────────────────────
const LETTER_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "5XL", "6XL"];
const SIZE_RANK: Record<string, number> = Object.fromEntries(LETTER_SIZES.map((s, i) => [s, i]));
SIZE_RANK["2XL"] = SIZE_RANK.XXL;

/** Sizes in the order a shop reads them: XS S M L XL…, then numbers (26 28 30…), then the rest. */
export function compareSizes(a: string, b: string): number {
  const ka = sizeKey(a);
  const kb = sizeKey(b);
  return ka[0] - kb[0] || ka[1] - kb[1] || a.localeCompare(b);
}
function sizeKey(raw: string): [number, number] {
  const s = raw.trim().toUpperCase();
  if (s in SIZE_RANK) return [0, SIZE_RANK[s]];
  const n = Number.parseFloat(s);
  if (Number.isFinite(n) && /^\d+(\.\d+)?/.test(s)) return [1, n];
  if (s === "FREE" || s === "FREE SIZE" || s === "FS") return [3, 0];
  return [2, 0];
}

/** Colours and sizes as typed ("Red, Blue" / "S M L") into clean, de-duplicated lists. */
export function parseList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,\n/]+|\s{2,}|\t/)) {
    for (const piece of part.includes(",") ? part.split(",") : [part]) {
      const v = piece.trim().replace(/\s+/g, " ");
      if (v && !seen.has(v.toLowerCase())) {
        seen.add(v.toLowerCase());
        out.push(v);
      }
    }
  }
  return out;
}

/** Sizes typed with single spaces ("S M L XL") split on spaces too. */
export function parseSizes(text: string): string[] {
  return parseList(text.includes(",") || text.includes("\n") ? text : text.replace(/\s+/g, ",")).sort(compareSizes);
}

export type Variant = { colour: string | null; size: string | null };

/** Every colour × size of a style (one variant when neither is given). */
export function variantMatrix(colours: string[], sizes: string[]): Variant[] {
  const cs: (string | null)[] = colours.length ? colours : [null];
  const ss: (string | null)[] = sizes.length ? [...sizes].sort(compareSizes) : [null];
  return cs.flatMap((colour) => ss.map((size) => ({ colour, size })));
}

/** "Cotton Kurti — Red / M": the item name each variant bills and prints with. */
export function variantName(style: string, v: Variant): string {
  const parts = [v.colour, v.size].filter((x): x is string => !!x);
  return parts.length ? `${style.trim()} — ${parts.join(" / ")}` : style.trim();
}

/** A short stock-keeping code: STYLE-COL-SIZE, letters and digits only. */
export function variantSku(styleCode: string, v: Variant): string {
  const clean = (s: string, n: number) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, n);
  return [clean(styleCode, 10), v.colour ? clean(v.colour, 3) : null, v.size ? clean(v.size, 4) : null].filter(Boolean).join("-");
}

// ─── GST for moving goods (flags, never tax) ────────────────────────────────────
export type MovementGst = {
  /** Same GSTIN both ends (or the shop's own godowns without separate GSTINs). */
  internal: boolean;
  interState: boolean;
  /** Consignment above ₹50,000 moving by road: an e-way bill is likely needed (CGST Rule 138). */
  ewayLikely: boolean;
  review: boolean;
  notes: string[];
};

export function movementGst(m: { fromGstin?: string | null; toGstin?: string | null; fromState?: string | null; toState?: string | null; value: number }): MovementGst {
  const from = (m.fromGstin ?? "").trim().toUpperCase();
  const to = (m.toGstin ?? "").trim().toUpperCase();
  const fromState = (m.fromState ?? from.slice(0, 2)).trim();
  const toState = (m.toState ?? to.slice(0, 2)).trim();
  const interState = !!fromState && !!toState && fromState !== toState;
  const internal = from === to;
  const notes: string[] = [];
  let review = false;
  if (internal) {
    notes.push("Same registration at both ends: moving goods between your own places is not a sale. Send it with a delivery challan / stock transfer note.");
  } else if (from && to) {
    review = true;
    notes.push("Different GSTINs: the two places are distinct persons under GST, so this movement can be a taxable supply. Check with your CA before dispatch.");
  } else {
    review = true;
    notes.push("One end has no GSTIN recorded: check whether both places are under the same registration.");
  }
  if (interState && internal) {
    review = true;
    notes.push("The states differ but the GSTIN is the same — a registration covers one state; check the godowns' GSTINs.");
  }
  const ewayLikely = m.value > 50000;
  if (ewayLikely) notes.push("Value over ₹50,000: an e-way bill is usually needed for this movement (CGST Rule 138). Record its number.");
  return { internal, interState, ewayLikely, review, notes };
}

// ─── Financial years ────────────────────────────────────────────────────────────
/** "2026-27" for a date in India's April–March year. */
export function financialYearOf(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
export function nextFinancialYear(fy: string): string {
  const start = Number(fy.slice(0, 4)) + 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
/** The year's last day and the next one's first: 31 March / 1 April. */
export function financialYearBounds(fy: string): { closing: string; opening: string } {
  const end = Number(fy.slice(0, 4)) + 1;
  return { closing: `${end}-03-31`, opening: `${end}-04-01` };
}

// ─── Refused moves, in plain words ──────────────────────────────────────────────
type Detail = { name?: string; godown?: string; requested?: number; available?: number; pending?: number; asked?: number; eligible?: number; left?: number; status?: string };

/** The message a person sees when a garment posting is refused (the SQL function's error code and detail). */
export function refusalMessage(code: string, rawDetail?: string | null): string {
  let d: Detail = {};
  try {
    d = rawDetail ? (JSON.parse(rawDetail) as Detail) : {};
  } catch {
    d = {};
  }
  const item = d.name ? `${d.name}: ` : "";
  switch (code) {
    case "insufficient_godown_stock":
      return `${item}only ${fmt(d.available)} in ${d.godown ?? "that godown"}, ${fmt(d.requested)} asked.`;
    case "insufficient_damaged_stock":
      return `${item}only ${fmt(d.available)} in damaged stock there.`;
    case "insufficient_stock":
      return "Not enough stock of an item in the shop for this move.";
    case "receive_exceeds_pending":
      return `${item}only ${fmt(d.pending)} still on the way, ${fmt(d.asked)} entered. Record any extra as a stock difference.`;
    case "return_exceeds_purchase":
      return `${item}only ${fmt(d.eligible)} can still go back against this purchase.`;
    case "return_rate_above_purchase":
      return "A return can't be valued above the purchase rate.";
    case "disposition_exceeds_return":
      return `Only ${fmt(d.left)} of that returned line is left to place.`;
    case "transfer_wrong_status":
    case "damage_wrong_status":
    case "discrepancy_wrong_status":
    case "count_wrong_status":
    case "purchase_return_wrong_status":
      return d.status ? `This can't be done while it is "${d.status.replace(/_/g, " ")}" — someone may have just changed it. Reload and check.` : "This step isn't allowed now. Reload and check.";
    case "year_already_closed":
      return "This financial year is already closed.";
    case "already_carried_forward":
      return "This year's stock is already carried forward.";
    case "default_negative":
      return "The shop floor shows less than zero of an item — record the missing move or count it before changing the default godown.";
    case "not_tracked":
      return `${item}switch on "Track stock" for this item first.`;
    case "unknown_godown":
    case "inactive_godown":
      return "That godown isn't available (inactive or not this shop's).";
    case "unknown_item":
      return "An item on this document no longer exists.";
    case "no_default_godown":
      return "Choose the shop floor (default godown) first.";
    case "same_godown":
      return "From and to must be different godowns.";
    case "ledger_append_only":
      return "Stock history can't be changed — post a correcting entry.";
    default:
      return "Couldn't save this — check the connection and try again.";
  }
}

function fmt(n: number | undefined) {
  return n === undefined ? "?" : String(round3(n));
}
function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
