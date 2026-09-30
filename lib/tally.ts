// Tally import file (XML) for a period: party ledgers and the sales, purchase and tax ledgers they
// use, then Sales, Receipt, Purchase and Payment vouchers. Tally's convention: a debit is a negative
// amount with ISDEEMEDPOSITIVE Yes, a credit a positive one with No. Every voucher balances to the
// paisa — rounding lands on the Round Off ledger. Pure, so the export and the tests agree.

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const tallyDate = (iso: string) => iso.slice(0, 10).replace(/-/g, "");

export const CASH = "Cash";
export const BANK = "Bank (UPI / Card)";
export const ROUND_OFF = "Round Off";
export const salesLedger = (rate: number) => (rate > 0 ? `Sales @ ${rate}%` : "Sales - Exempt / Nil");
export const purchaseLedger = (rate: number) => (rate > 0 ? `Purchase @ ${rate}%` : "Purchase - Exempt / Nil");
export const moneyLedger = (method: string) => (method === "cash" ? CASH : BANK);

export type TallyParty = { name: string; group: "Sundry Debtors" | "Sundry Creditors"; gstin?: string | null; state?: string | null };
type Tax = { cgst: number; sgst: number; igst: number };
export type TallyInvoice = Tax & {
  number: string;
  date: string;
  /** The party ledger; null for a counter sale paid at once (it goes straight to Cash / Bank). */
  party: string | null;
  method: string;
  /** Taxable value by GST rate (they are scaled to `taxable`, so a bill discount spreads over them). */
  byRate: { rate: number; taxable: number }[];
  taxable: number;
  total: number;
  /** Paid at the time (a receipt or payment voucher follows for a party). */
  paid: number;
};
export type TallyMoney = { number?: string; date: string; party: string; amount: number; method: string };

/** The taxable value split by rate, adding up exactly to `taxable`. */
export function splitByRate(byRate: { rate: number; taxable: number }[], taxable: number): { rate: number; amount: number }[] {
  const merged = new Map<number, number>();
  for (const l of byRate) merged.set(l.rate, (merged.get(l.rate) ?? 0) + l.taxable);
  const lines = [...merged].map(([rate, amount]) => ({ rate, amount }));
  const sum = lines.reduce((s, l) => s + l.amount, 0);
  if (!lines.length) return [{ rate: 0, amount: r2(taxable) }];
  const out = lines.map((l) => ({ rate: l.rate, amount: sum > 0 ? r2((l.amount / sum) * taxable) : 0 }));
  const diff = r2(taxable - out.reduce((s, l) => s + l.amount, 0));
  if (diff !== 0) out.sort((a, b) => b.amount - a.amount)[0].amount = r2(out[0].amount + diff);
  return out.filter((l) => l.amount !== 0);
}

type Entry = { ledger: string; amount: number }; // + credit, − debit

function entriesXml(entries: Entry[]): string {
  return entries
    .filter((e) => r2(e.amount) !== 0)
    .map((e) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(e.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${e.amount < 0 ? "Yes" : "No"}</ISDEEMEDPOSITIVE><AMOUNT>${r2(e.amount).toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`)
    .join("");
}

function voucherXml(type: "Sales" | "Receipt" | "Purchase" | "Payment", v: { number?: string; date: string; party?: string | null; narration?: string }, entries: Entry[]): string {
  return (
    `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${type}" ACTION="Create" OBJVIEW="Accounting Voucher View">` +
    `<DATE>${tallyDate(v.date)}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME>` +
    (v.number ? `<VOUCHERNUMBER>${esc(v.number)}</VOUCHERNUMBER>` : "") +
    (v.party ? `<PARTYLEDGERNAME>${esc(v.party)}</PARTYLEDGERNAME>` : "") +
    (v.narration ? `<NARRATION>${esc(v.narration)}</NARRATION>` : "") +
    `<PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>` +
    entriesXml(entries) +
    `</VOUCHER></TALLYMESSAGE>`
  );
}

/** A sale's entries: the party (or Cash / Bank) debited, sales and output tax credited, rounding on Round Off. */
export function saleEntries(s: TallyInvoice): Entry[] {
  const sales = splitByRate(s.byRate, s.taxable).map((l) => ({ ledger: salesLedger(l.rate), amount: l.amount }));
  const taxes = [
    { ledger: "Output CGST", amount: r2(s.cgst) },
    { ledger: "Output SGST", amount: r2(s.sgst) },
    { ledger: "Output IGST", amount: r2(s.igst) },
  ];
  const credits = r2([...sales, ...taxes].reduce((a, e) => a + e.amount, 0));
  const round = r2(s.total - credits);
  return [{ ledger: s.party ?? moneyLedger(s.method), amount: -r2(s.total) }, ...sales, ...taxes, { ledger: ROUND_OFF, amount: round }];
}

/** A purchase's entries: purchase and input tax debited, the vendor credited. */
export function purchaseEntries(p: TallyInvoice & { party: string }): Entry[] {
  const buys = splitByRate(p.byRate, p.taxable).map((l) => ({ ledger: purchaseLedger(l.rate), amount: -l.amount }));
  const taxes = [
    { ledger: "Input CGST", amount: -r2(p.cgst) },
    { ledger: "Input SGST", amount: -r2(p.sgst) },
    { ledger: "Input IGST", amount: -r2(p.igst) },
  ];
  const debits = r2([...buys, ...taxes].reduce((a, e) => a + e.amount, 0));
  const round = r2(-p.total - debits);
  return [...buys, ...taxes, { ledger: ROUND_OFF, amount: round }, { ledger: p.party, amount: r2(p.total) }];
}

function ledgerXml(name: string, parent: string, extra = ""): string {
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${esc(name)}" ACTION="Create"><NAME.LIST><NAME>${esc(name)}</NAME></NAME.LIST><PARENT>${esc(parent)}</PARENT>${extra}</LEDGER></TALLYMESSAGE>`;
}

/** Two files, imported in this order in Tally: masters (Import → Masters), then vouchers (Import → Transactions). */
export function buildTallyXml(input: { parties: TallyParty[]; sales: TallyInvoice[]; receipts: TallyMoney[]; purchases: (TallyInvoice & { party: string })[]; payments: TallyMoney[] }): { masters: string; vouchers: string } {
  const ledgers = new Map<string, string>(); // name → xml
  const add = (name: string, parent: string, extra = "") => {
    if (!ledgers.has(name)) ledgers.set(name, ledgerXml(name, parent, extra));
  };
  for (const p of input.parties) {
    add(p.name, p.group, `<ISBILLWISEON>Yes</ISBILLWISEON>${p.gstin ? `<PARTYGSTIN>${esc(p.gstin)}</PARTYGSTIN><GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>` : ""}${p.state ? `<LEDSTATENAME>${esc(p.state)}</LEDSTATENAME>` : ""}`);
  }
  add(BANK, "Bank Accounts");
  add(ROUND_OFF, "Indirect Expenses");
  for (const t of ["Output CGST", "Output SGST", "Output IGST", "Input CGST", "Input SGST", "Input IGST"]) add(t, "Duties & Taxes", "<TAXTYPE>GST</TAXTYPE>");
  const vouchers: string[] = [];
  for (const s of input.sales) {
    for (const l of splitByRate(s.byRate, s.taxable)) add(salesLedger(l.rate), "Sales Accounts");
    vouchers.push(voucherXml("Sales", { number: s.number, date: s.date, party: s.party ?? moneyLedger(s.method) }, saleEntries(s)));
    if (s.party && s.paid > 0) vouchers.push(voucherXml("Receipt", { date: s.date, party: s.party, narration: `Against ${s.number}` }, [{ ledger: moneyLedger(s.method), amount: -r2(s.paid) }, { ledger: s.party, amount: r2(s.paid) }]));
  }
  for (const r of input.receipts) vouchers.push(voucherXml("Receipt", { number: r.number, date: r.date, party: r.party }, [{ ledger: moneyLedger(r.method), amount: -r2(r.amount) }, { ledger: r.party, amount: r2(r.amount) }]));
  for (const p of input.purchases) {
    for (const l of splitByRate(p.byRate, p.taxable)) add(purchaseLedger(l.rate), "Purchase Accounts");
    vouchers.push(voucherXml("Purchase", { number: p.number, date: p.date, party: p.party }, purchaseEntries(p)));
    if (p.paid > 0) vouchers.push(voucherXml("Payment", { date: p.date, party: p.party, narration: `Against ${p.number}` }, [{ ledger: p.party, amount: -r2(p.paid) }, { ledger: moneyLedger(p.method), amount: r2(p.paid) }]));
  }
  for (const p of input.payments) vouchers.push(voucherXml("Payment", { number: p.number, date: p.date, party: p.party }, [{ ledger: p.party, amount: -r2(p.amount) }, { ledger: moneyLedger(p.method), amount: r2(p.amount) }]));

  const envelope = (report: string, body: string) =>
    `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>${report}</REPORTNAME></REQUESTDESC><REQUESTDATA>${body}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>
`;
  return { masters: envelope("All Masters", [...ledgers.values()].join("")), vouchers: envelope("Vouchers", vouchers.join("")) };
}
