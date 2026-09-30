"use client";

import { keepValuesOnError } from "@/lib/keepValuesOnError";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createBillAction } from "@/lib/actions/bills";
import { saveQuotationAction } from "@/lib/actions/quotations";
import { customerBillExtrasAction } from "@/lib/actions/salonExtras";
import { customerCreditAction } from "@/lib/actions/credit";
import { clinicFollowUpAction } from "@/lib/actions/followUp";
import type { PackageView } from "@/lib/salonExtras";
import { useRouter } from "next/navigation";
import type { QuotationLine } from "@/lib/supabase/database.types";
import { KARATS, karatOf, type Karat } from "@/lib/metalRates";
import { quickCreateCustomerAction, lookupCustomerByPhoneAction } from "@/lib/actions/customers";
import { quickCreateProductAction } from "@/lib/actions/products";
import { calculateTransactionTotals } from "@/lib/validation/schemas";
import { determineSupplyType, GSTIN_REGEX, round2 } from "@/lib/gst";
import { INDIAN_STATES } from "@/lib/constants/states";
import { UNITS } from "@/lib/constants/states";
import { formatMoney, unitLabel } from "@/lib/format";
import { formatIsoDate } from "@/lib/dateHelpers";
import { useSyncCalculatorAmount } from "@/lib/calculatorAmount";
import { SearchableSelect } from "@/app/components/SearchableSelect";
import { InlineQuickAdd } from "@/app/components/InlineQuickAdd";
import { Spinner } from "@/app/components/Spinner";
import { Zap, Package, AlertTriangle, Pill, Truck, Gem, Recycle, Mic, ScanBarcode, ShoppingCart, Sparkles, X, Plus } from "lucide-react";
import { barcodeFromQuery } from "@/lib/barcodeQuery";
import { saltKey, substitutesFor } from "@/lib/salt";
import { freeUnits, nextFree, type Bxgy } from "@/lib/bxgy";
import { parseScaleBarcode, pluMatches, type ScaleSettings } from "@/lib/scaleBarcode";
import dynamic from "next/dynamic";
const CameraBarcodeScanner = dynamic(() => import("@/app/components/CameraBarcodeScanner").then((m) => m.CameraBarcodeScanner), { ssr: false });
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useT } from "@/lib/i18n/LangContext";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import type { Lang } from "@/lib/i18n/dictionary";
import { parseVoiceOrderAction } from "@/lib/actions/voiceOrder";
import { getSpeechRecognition, speechLocaleFor, voiceErrorMessages, type SpeechRecognitionLike } from "@/lib/speechRecognition";
import { AIStatusBadge, type AIStatusBadgeHandle } from "@/app/components/AIStatusBadge";

/** Business types whose items are goods even when no HSN code was entered (e-way bill reminder). */
const GOODS_BUSINESSES = new Set(["grocery", "mart", "hardware", "pharmacy", "jewellery", "general", "transport", "wholesale"]);

type Product = {
  id: string;
  name: string;
  price: number;
  gstPercent: number;
  hsnCode: string | null;
  barcode: string | null;
  unit: string;
  trackInventory: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
  requiresPrescription: boolean;
  unitsPerPack: number | null;
  looseUnitName: string | null;
  metalType: "gold" | "silver" | null;
  purity: string | null;
  makingChargeType: "per_gram" | "flat" | "percent" | null;
  makingChargeValue: number | null;
  wastagePercent: number | null;
  bulkMinQty: number | null;
  bulkPrice: number | null;
  hallmarkNumber: string | null;
  /** Salt / composition (pharmacy only) — for same-salt substitutes. */
  salt?: string | null;
  /** A "buy X get Y free" offer on the item (Offers). */
  bxgy?: Bxgy | null;
  /** The rate a wholesale party pays (Rate list). */
  wholesalePrice?: number | null;
};
type Customer = { id: string; name: string; phone: string; gstin: string | null; state_code: string | null; loyalty_points?: number; priceLevel?: "retail" | "wholesale"; beat?: string | null };
type CartLine = {
  productId: string;
  name: string;
  price: number;
  packPrice: number;
  gstPercent: number;
  hsnCode: string | null;
  unit: string;
  quantity: number;
  trackInventory: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
  requiresPrescription: boolean;
  unitsPerPack: number | null;
  looseUnitName: string | null;
  saleMode: "pack" | "loose";
  regularPrice: number;
  bulkMinQty: number | null;
  bulkPrice: number | null;
  /** A rate set on purpose (said to voice billing) — kept through quantity changes. */
  priceOverride?: boolean;
  /** A session taken from the customer's package (₹0), and how many that package has left. */
  packageId?: string;
  packageLeft?: number;
};

function SubmitButton({ blocked, generatingLabel, submitLabel }: { blocked: boolean; generatingLabel: string; submitLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || blocked}
      className="btn-primary flex w-full items-center justify-center gap-2 text-center"
    >
      {pending && <Spinner />}
      {pending ? generatingLabel : submitLabel}
    </button>
  );
}

export function NewBillClient({
  shopStateCode,
  products,
  customers,
  lang,
  frequentProductIds,
  affinityMap,
  shopContext,
  vehicles,
  businessType,
  goldRates,
  silverRate,
  loyaltyRedemptionValue,
  barcodeScanMode = "both",
  b2bAvailable = false,
  initialCustomerId = null,
  initialProvider = "",
  quotationsAvailable = false,
  fromQuote = null,
  fromChallans = null,
  scaleBarcode = null,
  ordersAvailable = false,
  fromScheme = null,
  stylists = [],
  extrasAvailable = false,
}: {
  /** Salon: the people on the payroll list, to pick who did the work (and earns its commission). */
  stylists?: string[];
  /** Packages and prepaid balance can be used (migration 0048). */
  extrasAvailable?: boolean;
  /** Buying jewellery with a gold saving scheme: its value pays for the bill. */
  fromScheme?: { id: string; number: string; value: number; complete: boolean } | null;
  /** "Save as quotation" is offered once migration 0045 has run. */
  quotationsAvailable?: boolean;
  /** Billing an accepted quotation: its lines, discount and number. */
  fromQuote?: { id: string; number: string; lines: QuotationLine[]; discountType: "flat" | "percent"; discountValue: number; honourPrices: boolean } | null;
  /** Delivery challans being billed: their goods (at today's prices), for their customer. */
  fromChallans?: { ids: string[]; numbers: string[]; lines: QuotationLine[] } | null;
  /** The weighing scale's label format: a scanned label bills the item at its weight or price. */
  scaleBarcode?: ScaleSettings | null;
  /** Wholesale: a salesman can save the cart as an order, billed later. */
  ordersAvailable?: boolean;
  /** Opened from an appointment: the customer and stylist to start with. */
  initialCustomerId?: string | null;
  initialProvider?: string;
  shopStateCode: string;
  products: Product[];
  customers: Customer[];
  lang: Lang;
  frequentProductIds: string[];
  affinityMap: Record<string, string>;
  vehicles: { id: string; name: string; ratePerKm: number }[];
  businessType: string;
  /** Today's gold rate for each karat. */
  goldRates: Record<Karat, number | null>;
  barcodeScanMode?: "camera" | "hardware" | "both" | "off";
  silverRate: number | null;
  loyaltyRedemptionValue: number;
  /** The B2B invoice switch — shown once the database can freeze the buyer on each bill. */
  b2bAvailable?: boolean;
  shopContext: {
    shopId: string;
    shopName: string;
    shopStateCode: string;
    staffId: string;
    staffName: string;
    invoicePrefix: string;
    /** Shop setting: prices already include GST. Must match what the
     * server uses, or the checkout total differs from the invoice. */
    priceIncludesGst: boolean;
    /** "composition": the live preview must show ₹0 tax too, matching what
     * createBillCore actually charges — composition dealers can't collect GST. */
    gstScheme: "regular" | "composition";
    /** Staff with "Give discounts" (and the owner): discounts and spoken rates. The server checks too. */
    canDiscount: boolean;
  };
}) {
  const { t } = useTranslation(lang);
  const isOnline = useOnlineStatus();
  const [step, setStep] = useState<"cart" | "ticket">("cart");
  const [cart, setCart] = useState<CartLine[]>(() => (fromQuote ? cartFromQuote(fromQuote.lines, products, fromQuote.honourPrices) : fromChallans ? cartFromQuote(fromChallans.lines, products, false) : []));
  const router = useRouter();
  const [quoteDays, setQuoteDays] = useState(15);
  const [quoteSaving, setQuoteSaving] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Refresh the offline cache every time this page loads successfully
  // (i.e. while online) — so if the connection drops mid-day, there's
  // always a reasonably fresh local copy of products/customers to work
  // from in the offline billing flow.
  useEffect(() => {
    import("@/lib/offline-db").then(({ cacheForOffline }) => {
      cacheForOffline(
        { ...shopContext, cachedAt: new Date().toISOString() },
        products.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          gstPercent: p.gstPercent,
          hsnCode: p.hsnCode,
          barcode: p.barcode,
          unit: p.unit,
        })),
        customers.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          gstin: c.gstin,
          stateCode: c.state_code,
        })),
      )
        .catch((err) => console.error("[offline-db] Failed to cache for offline use:", err));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [scanError, setScanError] = useState<string | null>(null);
  // A medicine whose same-salt substitutes are on show (picked out of stock, or asked for).
  const [subsFor, setSubsFor] = useState<string | null>(null);
  // How many medicines share each salt, so a bill line can offer "same salt" only when there is one.
  const saltOf = useMemo(() => {
    const keyById = new Map<string, string>();
    const count = new Map<string, number>();
    for (const p of products) {
      const k = saltKey(p.salt);
      if (!k) continue;
      keyById.set(p.id, k);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    return (id: string) => { const k = keyById.get(id); return k ? (count.get(k) ?? 1) - 1 : 0; };
  }, [products]);
  const frequentProducts = frequentProductIds
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is Product => Boolean(p));

  // "Bought together" nudge — looks at the most recently added cart
  // line first, so the suggestion always reacts to what was just
  // added rather than getting stuck on the first item forever.
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const basketBuddy = useMemo(() => {
    for (let i = cart.length - 1; i >= 0; i--) {
      const partnerId = affinityMap[cart[i].productId];
      if (!partnerId) continue;
      if (cart.some((c) => c.productId === partnerId)) continue;
      if (dismissedSuggestions.has(partnerId)) continue;
      const partner = products.find((p) => p.id === partnerId);
      // Suggesting something that can't actually be sold right now is
      // worse than no suggestion — the person would tap +Add into a
      // stockout, exactly the problem the dashboard's own mismatched-
      // stock alert exists to flag, not something to nudge toward.
      if (partner && (!partner.trackInventory || partner.stockQuantity > 0)) return partner;
    }
    return null;
  }, [cart, affinityMap, dismissedSuggestions, products]);
  const cartEndRef = useRef<HTMLDivElement>(null);

  // Scroll the newest cart item into view whenever something is added —
  // on mobile the keyboard often covers half the screen while searching,
  // so without this the item you just added isn't visible until you
  // manually scroll or dismiss the keyboard.
  useEffect(() => {
    if (cart.length > 0) {
      cartEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [cart.length]);
  const startCustomer = initialCustomerId ? customers.find((c) => c.id === initialCustomerId) ?? null : null;
  const [customerMode, setCustomerMode] = useState<"walkin" | "existing">(startCustomer ? "existing" : "walkin");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(startCustomer);
  const [networkReliability, setNetworkReliability] = useState<{ shopsVisited: number; tier: "new" | "building" | "trusted" } | null>(null);

  useEffect(() => {
    if (!selectedCustomer?.phone) {
      setNetworkReliability(null);
      return;
    }
    let cancelled = false;
    import("@/lib/actions/customerNetwork").then(({ getNetworkReliabilityAction }) =>
      getNetworkReliabilityAction(selectedCustomer.phone).then((r) => {
        if (!cancelled) setNetworkReliability(r);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [selectedCustomer?.phone]);
  // The customer's packages and prepaid balance. Package sessions and balance already in the bill
  // belong to whoever was picked before, so they go when the customer changes.
  const extrasCustomerId = extrasAvailable && customerMode === "existing" ? selectedCustomer?.id ?? null : null;
  useEffect(() => {
    setExtras(null);
    setWalletUse(0);
    setCart((prev) => (prev.some((c) => c.packageId) ? prev.filter((c) => !c.packageId) : prev));
    if (!extrasCustomerId) return;
    let cancelled = false;
    customerBillExtrasAction(extrasCustomerId).then((r) => {
      if (!cancelled) setExtras(r);
    });
    return () => {
      cancelled = true;
    };
  }, [extrasCustomerId]);

  // The customer's udhaar limit and what they owe already, to warn before this bill takes them past it.
  const [credit, setCredit] = useState<{ limit: number | null; balance: number } | null>(null);
  const creditCustomerId = customerMode === "existing" ? selectedCustomer?.id ?? null : null;
  useEffect(() => {
    setCredit(null);
    if (!creditCustomerId) return;
    let cancelled = false;
    customerCreditAction(creditCustomerId).then((r) => {
      if (!cancelled) setCredit(r);
    });
    return () => {
      cancelled = true;
    };
  }, [creditCustomerId]);
  // A different party may pay a different rate: the cart follows (typed or promised prices stay).
  const partyLevel = customerMode === "existing" ? (selectedCustomer?.priceLevel ?? "retail") : "retail";
  useEffect(() => {
    setCart((prev) =>
      prev.map((line) => {
        const base = products.find((x) => x.id === line.productId);
        if (!base || line.priceOverride || line.packageId) return line;
        const p = partyLevel === "wholesale" && base.wholesalePrice != null ? { ...base, price: base.wholesalePrice, bulkMinQty: null, bulkPrice: null } : base;
        const price = line.saleMode === "loose" && p.unitsPerPack ? round2(p.price / p.unitsPerPack) : priceForQuantity(p.price, p.bulkMinQty, p.bulkPrice, line.quantity);
        return price === line.price && line.packPrice === p.price ? line : { ...line, price, packPrice: p.price, regularPrice: p.price, bulkMinQty: p.bulkMinQty, bulkPrice: p.bulkPrice };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reprice only when the party's rate level changes
  }, [partyLevel]);
  // Clinic: a consultation inside the free follow-up window is ₹0 (the server decides the same).
  const [followUp, setFollowUp] = useState<{ productIds: string[]; lastPaid: string; until: string } | null>(null);
  useEffect(() => {
    setFollowUp(null);
    if (!creditCustomerId || businessType !== "clinic") return;
    let cancelled = false;
    clinicFollowUpAction(creditCustomerId).then((r) => {
      if (!cancelled) setFollowUp(r);
    });
    return () => {
      cancelled = true;
    };
  }, [creditCustomerId, businessType]);
  const freeFee = useMemo(() => new Set(followUp?.productIds ?? []), [followUp]);

  const [discountType, setDiscountType] = useState<"percent" | "flat">(fromQuote?.discountType ?? "flat");
  const [discountValue, setDiscountValue] = useState(fromQuote?.discountValue ?? 0);
  const [redeemPoints, setRedeemPoints] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number | "">("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "upi" | "online" | "other">("cash");
  const [doctorName, setDoctorName] = useState("");
  const [patientName, setPatientName] = useState("");
  // The stylist: one from the list when the name matches (an appointment's may be typed differently).
  const [serviceProviderName, setServiceProviderName] = useState(() => stylists.find((s) => s.trim().toLowerCase() === initialProvider.trim().toLowerCase()) ?? initialProvider);
  const [otherStylist, setOtherStylist] = useState(() => !!initialProvider.trim() && !stylists.some((s) => s.trim().toLowerCase() === initialProvider.trim().toLowerCase()));
  // A different stylist for some lines (by cart line key); the rest are the bill's stylist.
  const [lineProviders, setLineProviders] = useState<Record<string, string>>({});
  // The customer's packages with sessions left, and their prepaid balance.
  const [extras, setExtras] = useState<{ packages: PackageView[]; wallet: number } | null>(null);
  const [walletUse, setWalletUse] = useState(0);
  const [exchangeInfo, setExchangeInfo] = useState<{
    metal: "gold" | "silver";
    description: string;
    grossWeight: number;
    purityPercent: number;
    ratePerGram: number;
    value: number;
  } | null>(null);
  // Old gold or silver handed over pays part of the bill; paidAmount stays the cash (or UPI, card...) only.
  // Old gold handed over and a gold scheme being used both pay part of the bill before any cash.
  // Prepaid balance used pays part of it the same way.
  const exchangeValue = (exchangeInfo?.value ?? 0) + (fromScheme?.value ?? 0) + walletUse;
  const [tripInfo, setTripInfo] = useState<{ vehicleId: string; km: number; driverName: string; loadWeight: number | null; loadUnit: string } | null>(null);

  // B2B invoice: made out to a business and its GSTIN, which the buyer uses to claim input tax
  // credit. Switches itself on (and fills in) for a customer who has a GSTIN; can be a different
  // business than the customer — an employee buying for their company.
  const [b2bOn, setB2bOn] = useState(false);
  const [buyer, setBuyer] = useState({ name: "", gstin: "", address: "" });
  const buyerGstinValid = GSTIN_REGEX.test(buyer.gstin.trim().toUpperCase());
  const customerForB2b = customerMode === "existing" ? selectedCustomer : null;
  useEffect(() => {
    setB2bOn(!!customerForB2b?.gstin);
    setBuyer({ name: customerForB2b?.gstin ? customerForB2b.name : "", gstin: customerForB2b?.gstin ?? "", address: "" });
  }, [customerForB2b?.id, customerForB2b?.gstin, customerForB2b?.name]);
  const b2bInvalid = b2bAvailable && b2bOn && (!buyer.name.trim() || !buyerGstinValid);

  const supplyType = useMemo(
    () =>
      determineSupplyType(
        shopStateCode,
        b2bAvailable && b2bOn && buyerGstinValid
          ? buyer.gstin.trim().slice(0, 2)
          : customerMode === "existing" ? selectedCustomer?.state_code ?? null : null,
      ),
    [shopStateCode, customerMode, selectedCustomer, b2bAvailable, b2bOn, buyerGstinValid, buyer.gstin],
  );

  const cartSubtotal = cart.reduce((s, c) => s + c.quantity * c.price, 0);
  const redemptionValue =
    redeemPoints && selectedCustomer
      ? Math.min(Math.min(selectedCustomer.loyalty_points ?? 0, 1_000_000) * loyaltyRedemptionValue, cartSubtotal)
      : 0;
  // The genuine number of points this redemption actually consumes —
  // proportional to the (possibly capped) rupee value used, not the
  // customer's full balance, so redeeming against a small bill never
  // burns more points than the discount they genuinely received.
  const redeemedPointsCount =
    redemptionValue > 0 && loyaltyRedemptionValue > 0 ? Math.ceil(redemptionValue / loyaltyRedemptionValue) : 0;

  // Free units of a buy-X-get-Y offer are not charged (the bill shows them on their own ₹0 line).
  const offerById = useMemo(() => new Map(products.filter((p) => p.bxgy).map((p) => [p.id, p.bxgy as Bxgy])), [products]);
  const freeOf = (c: CartLine) => (c.saleMode === "pack" && !c.priceOverride && !c.packageId ? freeUnits(c.quantity, offerById.get(c.productId)) : 0);
  const totals = useMemo(
    () =>
      calculateTransactionTotals({
        items: cart.map((c) => ({
          quantity: c.saleMode === "pack" && !c.priceOverride && !c.packageId ? c.quantity - freeUnits(c.quantity, offerById.get(c.productId)) : c.quantity,
          unitPrice: freeFee.has(c.productId) ? 0 : c.price,
          gstPercent: shopContext.gstScheme === "composition" ? 0 : c.gstPercent,
        })),
        discountType,
        discountValue: discountType === "flat" ? discountValue + redemptionValue : discountValue,
        paidAmount: (typeof paidAmount === "number" ? paidAmount : 0) + exchangeValue,
        supplyType,
        priceMode: shopContext.priceIncludesGst ? "inclusive" : "exclusive",
      }),
    [cart, offerById, freeFee, discountType, discountValue, redemptionValue, paidAmount, exchangeValue, supplyType, shopContext.priceIncludesGst, shopContext.gstScheme],
  );

  // An e-way bill is needed before goods (not services) worth over ₹50,000 move by vehicle. A line
  // counts as goods when its code isn't a service (SAC) code, which all start with 99; a line with
  // no code counts only in a business that sells goods, so a big gym or clinic bill isn't flagged.
  const ewayGoodsValue = cart.reduce((sum, line, i) => {
    const isGoods = line.hsnCode ? !line.hsnCode.startsWith("99") : GOODS_BUSINESSES.has(businessType);
    const charged = totals.lines[i];
    return isGoods && charged ? sum + charged.lineSubtotal + charged.lineGst : sum;
  }, 0);

  const [state, formAction] = useActionState(keepValuesOnError(createBillAction), null);

  // The floating calculator picks this up automatically when opened.
  useSyncCalculatorAmount(cart.length > 0 ? totals.total : null);

  function handleBarcodeScan(code: string) {
    const match = products.find((p) => p.barcode === code);
    // A weighing-scale label: the item (by its code) at the weight or price printed on it.
    const scale = match ? null : parseScaleBarcode(code, scaleBarcode);
    const weighed = scale ? products.find((p) => pluMatches(p.barcode, scale.plu)) : undefined;
    if (match) {
      addProduct(match);
      setScanError(null);
    } else if (scale && weighed) {
      const qty = scale.weightKg ?? (weighed.price > 0 ? (scale.price ?? 0) / weighed.price : 0);
      const had = cart.find((c) => c.productId === weighed.id && c.saleMode === "pack")?.quantity ?? 0;
      addProduct(weighed);
      updateQuantity(weighed.id, Math.round((had + qty) * 1000) / 1000);
      setScanError(null);
    } else if (scale) {
      setScanError(t("Scale label for item code {code} — no item has this code as its barcode.", { code: scale.plu }));
    } else {
      setScanError(`${t("bill.noProductFound")}: "${code}"`);
    }
  }

  function priceForQuantity(regularPrice: number, bulkMinQty: number | null, bulkPrice: number | null, quantity: number) {
    if (bulkMinQty && bulkPrice && quantity >= bulkMinQty) return bulkPrice;
    return regularPrice;
  }

  /** The item as this party buys it: a wholesale party pays the wholesale rate (no bulk slab on top). */
  function atLevel(p: Product): Product {
    return selectedCustomer?.priceLevel === "wholesale" && p.wholesalePrice != null ? { ...p, price: p.wholesalePrice, bulkMinQty: null, bulkPrice: null } : p;
  }

  function addProduct(input: Product) {
    const p = atLevel(input);
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === p.id);
      if (existing) {
        const newQty = existing.quantity + 1;
        return prev.map((c) =>
          c.productId === p.id
            ? { ...c, quantity: newQty, price: priceForQuantity(c.regularPrice, c.bulkMinQty, c.bulkPrice, newQty) }
            : c,
        );
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          price: priceForQuantity(p.price, p.bulkMinQty, p.bulkPrice, 1),
          packPrice: p.price,
          gstPercent: p.gstPercent,
          hsnCode: p.hsnCode,
          unit: p.unit,
          quantity: 1,
          trackInventory: p.trackInventory,
          stockQuantity: p.stockQuantity,
          lowStockThreshold: p.lowStockThreshold,
          requiresPrescription: p.requiresPrescription,
          unitsPerPack: p.unitsPerPack,
          looseUnitName: p.looseUnitName,
          saleMode: "pack",
          regularPrice: p.price,
          bulkMinQty: p.bulkMinQty,
          bulkPrice: p.bulkPrice,
        },
      ];
    });
  }

  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceStatusRef = useRef<AIStatusBadgeHandle>(null);

  useEffect(() => {
    setVoiceSupported(getSpeechRecognition() !== null);
  }, []);

  /** "2 samosa, 1 chai" spoken → parsed by Groq → matched against this
   * shop's real products → each added to the cart via the SAME
   * addProduct used everywhere else (called once per unit — it
   * already knows how to bump an existing line's quantity), so
   * bulk pricing, GST, and pack/loose logic all stay exactly
   * consistent with adding items by hand. */
  function startVoiceOrder() {
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) return;
    setVoiceStatus(null);
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = speechLocaleFor(lang);
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    async function tryParseAlternatives(alternatives: string[], attemptIndex = 0): Promise<void> {
      const transcript = alternatives[attemptIndex];
      if (!transcript?.trim()) {
        setVoiceStatus(t("voice.noItems"));
        return;
      }
      const result = await parseVoiceOrderAction(transcript);
      if (result.errorType) voiceStatusRef.current?.reportError(result.errorType);
      if (result.error === "not_configured") {
        setVoiceStatus(t("voice.notConfigured"));
        return;
      }
      if (result.error) {
        setVoiceStatus(result.error);
        return;
      }
      if (!result.items || result.items.length === 0) {
        if (attemptIndex + 1 < alternatives.length) {
          return tryParseAlternatives(alternatives, attemptIndex + 1);
        }
        setVoiceStatus(t("voice.noItems"));
        return;
      }

      const unmatched: string[] = [];
      const pricesOverridden: string[] = [];
      for (const item of result.items) {
        const product = item.matchedProductId ? products.find((p) => p.id === item.matchedProductId) : undefined;
        if (!product) {
          unmatched.push(item.spokenName);
          continue;
        }
        for (let i = 0; i < item.quantity; i++) addProduct(product);

        // A rate said out loud is a deliberate instruction ("lays 10
        // packet, 10 rupees each") and should win over the catalog
        // price — that's the whole reason someone would say it.
        // Only for staff allowed to give discounts — anyone else keeps the catalogue price, which
        // is also what the server would charge.
        if (item.spokenUnitPrice !== null && shopContext.canDiscount) {
          const spokenRate = item.spokenUnitPrice;
          setCart((prev) => prev.map((c) => (c.productId === product.id ? { ...c, price: spokenRate, regularPrice: spokenRate, packPrice: spokenRate, priceOverride: true } : c)));
          pricesOverridden.push(`${product.name} @ ₹${spokenRate}`);
        }
      }

      // "Amit ke liye bill banao" — switch the bill to that customer
      // automatically. Only when the spoken name genuinely matches an
      // existing customer; an unrecognized name is reported back
      // rather than silently creating a new customer record from a
      // possibly-misheard name.
      let customerNote = "";
      if (result.customer) {
        const matched = result.customer.matchedId ? customers.find((c) => c.id === result.customer!.matchedId) : undefined;
        if (matched) {
          setCustomerMode("existing");
          setSelectedCustomer(matched);
          customerNote = ` Billed to ${matched.name}.`;
        } else {
          customerNote = ` No customer named "${result.customer.spokenName}" — pick one by hand.`;
        }
      }

      setVoiceStatus(
        (unmatched.length > 0
          ? t("voice.addedSome", { added: result.items.length - unmatched.length, missing: unmatched.join(", ") })
          : t("voice.addedAll", { count: result.items.length })) +
          customerNote +
          (pricesOverridden.length > 0 ? ` Rate set: ${pricesOverridden.join(", ")}.` : ""),
      );
      setTimeout(() => setVoiceStatus(null), 5000);
    }

    recognition.onresult = async (event) => {
      const latest = event.results[event.results.length - 1];
      if (!latest) return;

      const liveText = latest[0]?.transcript ?? "";
      if (!latest.isFinal) {
        if (liveText.trim()) setVoiceStatus(`"${liveText.trim()}"`);
        return;
      }

      if (!liveText.trim()) return;
      setVoiceStatus(t("voice.reading"));
      const alternatives: string[] = [];
      for (let i = 0; i < latest.length; i++) {
        const alt = latest[i]?.transcript;
        if (alt) alternatives.push(alt);
      }
      await tryParseAlternatives(alternatives);
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      const messages = voiceErrorMessages(lang);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") setVoiceStatus(messages.permission);
      else if (event.error === "no-speech") setVoiceStatus(messages.noSpeech);
      else if (event.error === "network") setVoiceStatus(messages.network);
      else setVoiceStatus(messages.generic);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }

  function addTransportCharge(
    vehicleId: string,
    vehicleName: string,
    km: number,
    ratePerKm: number,
    driverName: string,
    loadWeight: number | null,
    loadUnit: string,
  ) {
    const amount = Math.round(km * ratePerKm * 100) / 100;
    const loadLabel = loadWeight ? ` · ${loadWeight} ${loadUnit}` : "";
    setCart((prev) => [
      ...prev.filter((c) => c.productId !== "__transport_charge__"),
      {
        productId: "__transport_charge__",
        name: `Transport: ${vehicleName} (${km} km${loadLabel})`,
        price: amount,
        packPrice: amount,
        gstPercent: 0,
        hsnCode: null,
        unit: "trip",
        quantity: 1,
        trackInventory: false,
        stockQuantity: 0,
        lowStockThreshold: 0,
        requiresPrescription: false,
        unitsPerPack: null,
        looseUnitName: null,
        saleMode: "pack",
        regularPrice: amount,
        bulkMinQty: null,
        bulkPrice: null,
      },
    ]);
    setTripInfo({ vehicleId, km, driverName, loadWeight, loadUnit });
  }

  function addJewelleryItem(name: string, amount: number, gstPercent: number) {
    const uniqueId = `__jewellery_${Date.now()}_${Math.random().toString(36).slice(2, 7)}__`;
    setCart((prev) => [
      ...prev,
      {
        productId: uniqueId,
        name: name,
        price: amount,
        packPrice: amount,
        gstPercent,
        hsnCode: null,
        unit: "item",
        quantity: 1,
        trackInventory: false,
        stockQuantity: 0,
        lowStockThreshold: 0,
        requiresPrescription: false,
        unitsPerPack: null,
        looseUnitName: null,
        saleMode: "pack",
        regularPrice: amount,
        bulkMinQty: null,
        bulkPrice: null,
      },
    ]);
  }

  /** One session from the customer's package, at ₹0 (its price was paid when it was sold). */
  function addPackageSession(p: PackageView) {
    const key = `__package_${p.id}`;
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === key);
      if (existing) return existing.quantity >= p.left ? prev : prev.map((c) => (c.productId === key ? { ...c, quantity: c.quantity + 1 } : c));
      return [
        ...prev,
        {
          productId: key,
          name: `${p.serviceName} (package)`,
          price: 0,
          packPrice: 0,
          gstPercent: 0,
          hsnCode: null,
          unit: "NOS",
          quantity: 1,
          trackInventory: false,
          stockQuantity: 0,
          lowStockThreshold: 0,
          requiresPrescription: false,
          unitsPerPack: null,
          looseUnitName: null,
          saleMode: "pack",
          regularPrice: 0,
          bulkMinQty: null,
          bulkPrice: null,
          packageId: p.id,
          packageLeft: p.left,
        },
      ];
    });
  }

  function updateQuantity(productId: string, quantity: number) {
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((c) => c.productId !== productId)
        : prev.map((c) =>
            c.productId === productId
              ? {
                  ...c,
                  // A package line: whole sessions, no more than the package has left.
                  quantity: c.packageLeft != null ? Math.max(1, Math.min(Math.round(quantity), c.packageLeft)) : quantity,
                  price: c.saleMode === "pack" && !c.priceOverride ? priceForQuantity(c.regularPrice, c.bulkMinQty, c.bulkPrice, quantity) : c.price,
                }
              : c,
          ),
    );
  }

  /** Gives a same-salt medicine instead of the one on the bill, for the same quantity. */
  function swapLine(fromId: string, to: Product) {
    const qty = cart.find((c) => c.productId === fromId && c.saleMode === "pack")?.quantity ?? 1;
    const already = cart.find((c) => c.productId === to.id)?.quantity ?? 0;
    setCart((prev) => prev.filter((c) => c.productId !== fromId));
    addProduct(to);
    if (already + qty !== 1) updateQuantity(to.id, already + qty);
  }

  function toggleSaleMode(productId: string, mode: "pack" | "loose") {
    setCart((prev) =>
      prev.map((c) => {
        if (c.productId !== productId || c.saleMode === mode) return c;
        if (mode === "loose" && c.unitsPerPack) {
          return { ...c, saleMode: "loose", quantity: 1, price: round2(c.packPrice / c.unitsPerPack) };
        }
        return { ...c, saleMode: "pack", quantity: 1, price: c.packPrice };
      }),
    );
  }

  if (step === "cart") {
    const canComplete = cart.length > 0 && !(customerMode === "existing" && !selectedCustomer);
    const complete = () => {
      // What a scheme or old gold already covers isn't asked for again (prepaid balance is chosen
      // on the next screen, so it starts unused).
      setWalletUse(0);
      setPaidAmount(Math.max(0, totals.total - (exchangeInfo?.value ?? 0) - (fromScheme?.value ?? 0)));
      setStep("ticket");
    };
    return (
      // Desktop: a two-column counter layout — items on the left, a sticky
      // bill summary on the right. Phones keep the bar pinned above the nav.
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_300px] md:items-start md:gap-6">
      <div className="flex flex-col gap-3">
        {!isOnline && (
          <Link
            href="/offline-bill"
            className="rounded-lg border border-credit bg-credit-soft px-3 py-2 text-xs text-credit"
          >
            You&apos;re offline — tap here for offline billing instead. →
          </Link>
        )}

        <section className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted">{t("bill.customer")}</p>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-2 p-1" role="group">
            <button
              type="button"
              aria-pressed={customerMode === "walkin"}
              onClick={() => {
                setCustomerMode("walkin");
                setSelectedCustomer(null);
              }}
              className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                customerMode === "walkin" ? "bg-surface text-foreground shadow-[var(--elev-xs)]" : "text-muted"
              }`}
            >
              {t("bill.walkin")}
            </button>
            <button
              type="button"
              aria-pressed={customerMode === "existing"}
              onClick={() => setCustomerMode("existing")}
              className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
                customerMode === "existing" ? "bg-surface text-foreground shadow-[var(--elev-xs)]" : "text-muted"
              }`}
            >
              {t("bill.existingCustomer")}
            </button>
          </div>

          {customerMode === "existing" &&
            (selectedCustomer ? (
              <div className="flex items-center justify-between neu-card px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {selectedCustomer.name}
                  </p>
                  <p className="text-xs text-muted">{selectedCustomer.phone}</p>
                </div>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="shrink-0 text-xs font-medium text-brand"
                >
                  {t("bill.change")}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <SearchableSelect
            lang={lang}
                  items={customers}
                  getKey={(c) => c.id}
                  getLabel={(c) => c.name}
                  getSubLabel={(c) => (c.beat ? `${c.phone} · ${c.beat}` : c.phone)}
                  getKeywords={(c) => c.beat ?? ""}
                  onSelect={setSelectedCustomer}
                  placeholder={t("bill.searchCustomer")}
                />
                <InlineQuickAdd<{ id: string; name: string; phone: string; gstin: string | null; state_code: string | null }>
                  triggerLabel={t("bill.addNewCustomer")}
                  fields={[
                    { name: "name", label: t("bill.name"), required: true },
                    { name: "phone", label: t("bill.phone"), type: "tel", required: true },
                  ]}
                  onSubmit={async (v) => {
                    const r = await quickCreateCustomerAction(v.name, v.phone);
                    return { data: r.customer, error: r.error };
                  }}
                  onCreated={setSelectedCustomer}
                  contactFields={{ name: "name", phone: "phone" }}
                  phoneAutofill={async (phone) => (await lookupCustomerByPhoneAction(phone)).name}
                />
              </div>
            ))}
        </section>

        {extras && (extras.packages.length > 0 || extras.wallet > 0) && (
          <section className="flex flex-col gap-2 rounded-xl border border-brand bg-brand-soft px-3.5 py-3">
            {extras.packages.map((p) => {
              const inBill = cart.find((c) => c.packageId === p.id)?.quantity ?? 0;
              return (
                <div key={p.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-brand-text">
                      <Package size={13} className="mr-1 inline" />
                      {p.name}
                    </p>
                    <p className="text-xs text-brand-text/80">
                      {t("{left} of {total} left", { left: p.left - inBill, total: p.sessionsTotal })}
                      {p.expiresOn ? ` · ${t("till {date}", { date: p.expiresOn })}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addPackageSession(p)}
                    disabled={inBill >= p.left}
                    className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    {t("Use 1")}
                  </button>
                </div>
              );
            })}
            {extras.wallet > 0 && (
              <p className="text-xs text-brand-text">
                {t("Prepaid balance {amount} — use it on the next screen", { amount: formatMoney(extras.wallet) })}
              </p>
            )}
          </section>
        )}

        <section className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-muted">{t("bill.addProducts")}</p>
          {frequentProducts.length > 0 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto scroll-hide px-4 pb-1">
              {frequentProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className="flex shrink-0 items-center gap-1 rounded-full border border-brand bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand-text"
                  style={{ boxShadow: "var(--elev-xs)" }}
                >
                  <Zap size={11} /> {p.name}
                </button>
              ))}
            </div>
          )}
          <SearchableSelect
            lang={lang}
            items={products}
            getKey={(p) => p.id}
            getLabel={(p) => p.name}
            getKeywords={(p) => [p.barcode, p.salt].filter(Boolean).join(" ")}
            leadingIcon={<ScanBarcode size={17} />}
            onEnter={(text) => {
              const code = barcodeScanMode === "off" ? null : barcodeFromQuery(text, products);
              if (code) handleBarcodeScan(code);
              return !!code;
            }}
            getSubLabel={(p) =>
              p.trackInventory ? `${formatMoney(p.price)} · ${p.stockQuantity} ${unitLabel(p.unit)} left` : formatMoney(p.price)
            }
            onSelect={(p) => {
              setScanError(null);
              addProduct(p);
              // Out of stock? Offer another brand of the same salt.
              setSubsFor(p.salt && p.trackInventory && p.stockQuantity <= 0 && substitutesFor(p, products).length ? p.id : null);
            }}
            placeholder={barcodeScanMode === "off" ? t("bill.searchProducts") : t("bill.searchOrScan")}
          />
          {scanError && <p className="text-xs text-credit">{scanError}</p>}
          {subsFor && <SameSaltPanel item={products.find((p) => p.id === subsFor) ?? null} products={products} cart={cart} onSwap={(from, to) => { swapLine(from, to); setSubsFor(null); }} onClose={() => setSubsFor(null)} />}
          {/* Secondary ways to add items — one compact row instead of a
              stack of full-width controls under the search box. */}
          <div className="flex flex-wrap items-center gap-2">
            {barcodeScanMode !== "hardware" && barcodeScanMode !== "off" && (
              <div className="has-[.bg-black]:basis-full">
                <CameraBarcodeScanner compact onScan={handleBarcodeScan} />
              </div>
            )}
            {voiceSupported && (
              <button
                type="button"
                onClick={startVoiceOrder}
                disabled={isListening}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  isListening ? "animate-pulse border-danger bg-danger-soft text-danger" : "border-border bg-surface text-brand-text"
                }`}
              >
                <Mic size={13} /> {isListening ? t("voice.listening") : t("voice.speakItems")}
              </button>
            )}
            {voiceSupported && <AIStatusBadge ref={voiceStatusRef} provider="voice" />}
            <InlineQuickAdd<Product>
              triggerLabel={t("bill.addNewProduct").replace("+ ", "")}
              triggerIcon={<Plus size={13} />}
              triggerClassName="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-brand-text"
              fields={[
                { name: "name", label: t("bill.addNewProduct").replace("+ ", ""), required: true },
                { name: "price", label: t("Price (₹)"), type: "number", required: true },
                { name: "unit", label: t("Unit"), options: [...UNITS], defaultValue: "NOS" },
                { name: "gstPercent", label: "GST %", type: "number" },
              ]}
              onSubmit={async (v) => {
                const r = await quickCreateProductAction(
                  v.name,
                  Number(v.price) || 0,
                  Number(v.gstPercent) || 0,
                  v.unit || "NOS",
                );
                return {
                  data: r.product
                    ? { ...r.product, packPrice: r.product.price, trackInventory: false, stockQuantity: 0, lowStockThreshold: 0, requiresPrescription: false, unitsPerPack: null, looseUnitName: null, metalType: null, purity: null, makingChargeType: null, makingChargeValue: null, wastagePercent: null, bulkMinQty: null, bulkPrice: null, hallmarkNumber: null }
                    : undefined,
                  error: r.error,
                };
              }}
              onCreated={addProduct}
            />
          </div>
          {voiceStatus && <p className="text-center text-xs font-medium text-brand-text">{voiceStatus}</p>}
        </section>

        {vehicles.length > 0 && <TransportChargePicker vehicles={vehicles} onAdd={addTransportCharge} />}

        {businessType === "jewellery" && (Object.values(goldRates).some(Boolean) || silverRate) && (
          <JewelleryCalculator
            products={products.filter((p) => p.metalType)}
            goldRates={goldRates}
            silverRate={silverRate}
            lang={lang}
            priceIncludesGst={shopContext.priceIncludesGst}
            onAdd={addJewelleryItem}
          />
        )}

        {cart.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-7 text-center">
            <ShoppingCart size={22} className="text-muted" />
            <p className="text-sm text-muted">
              {products.length === 0 ? t("bill.noProductsYet") : t("bill.emptyCart")}
            </p>
            {products.length === 0 && (
              <Link href="/products" className="btn-primary-sm">
                {t("bill.addFirstProduct")}
              </Link>
            )}
          </div>
        )}

        {cart.length > 0 && (
          <section className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted">{t("bill.cart")} · {cart.length}</p>
            <ul className="flex flex-col gap-2">
              {cart.map((line) => (
                <li
                  key={line.productId}
                  className="flex flex-col gap-2 neu-card px-3.5 py-2.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {line.name}
                      </p>
                      <p className="text-xs text-muted">
                        {line.packageId
                          ? t("From the package · ₹0 · {left} left after this", { left: (line.packageLeft ?? 0) - line.quantity })
                          : <>{formatMoney(line.price)}/{line.saleMode === "loose" ? line.looseUnitName : unitLabel(line.unit)} · GST {line.gstPercent}%</>}
                      </p>
                      {line.bulkMinQty && line.bulkPrice && (
                        <p className="flex items-center gap-1 text-[11px] text-brand">
                          <Package size={10} />
                          {line.price === line.bulkPrice
                            ? `Bulk price applied (${line.bulkMinQty}+)`
                            : `${line.bulkMinQty}+ gets ${formatMoney(line.bulkPrice)}/unit`}
                        </p>
                      )}
                      {line.unitsPerPack && line.looseUnitName && (
                        <div className="mt-1 flex gap-1.5">
                          <button
                            onClick={() => toggleSaleMode(line.productId, "pack")}
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                              line.saleMode === "pack" ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
                            }`}
                          >
                            Full {unitLabel(line.unit)}
                          </button>
                          <button
                            onClick={() => toggleSaleMode(line.productId, "loose")}
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${
                              line.saleMode === "loose" ? "border-brand bg-brand-soft text-brand-text" : "border-border text-muted"
                            }`}
                          >
                            Loose {line.looseUnitName}
                          </button>
                        </div>
                      )}
                      {line.trackInventory && (
                        <StockIndicator
                          remaining={round2(
                            line.stockQuantity -
                              (line.saleMode === "loose" && line.unitsPerPack ? line.quantity / line.unitsPerPack : line.quantity),
                          )}
                          threshold={line.lowStockThreshold}
                          unit={line.unit}
                        />
                      )}
                      {!line.packageId && saltOf(line.productId) > 0 && (
                        <button type="button" onClick={() => setSubsFor(line.productId)} className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-brand-text">
                          <Pill size={11} /> {t("Same salt: {n} more", { n: saltOf(line.productId) })}
                        </button>
                      )}
                      {freeFee.has(line.productId) && followUp && (
                        <p className="mt-0.5 text-[11px] font-medium text-success">
                          {t("Free follow-up — paid visit on {date}, free till {until}", { date: formatIsoDate(followUp.lastPaid), until: formatIsoDate(followUp.until) })}
                        </p>
                      )}
                      {(() => {
                        const offer = offerById.get(line.productId);
                        if (!offer || line.saleMode !== "pack" || line.priceOverride || line.packageId) return null;
                        const free = freeOf(line);
                        const next = nextFree(line.quantity, offer);
                        return (
                          <p className="mt-0.5 text-[11px] font-medium text-success">
                            🎁 {free > 0 ? t("{n} free · {offer}", { n: free, offer: t("Buy {buy} get {free} free", { buy: offer.buy, free: offer.free }) }) : next ? t("Add {n} more — free ({offer})", { n: next.more, offer: t("Buy {buy} get {free} free", { buy: offer.buy, free: offer.free }) }) : t("Buy {buy} get {free} free", { buy: offer.buy, free: offer.free })}
                          </p>
                        );
                      })()}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() =>
                          updateQuantity(line.productId, round2(line.quantity - quantityStep(line.unit)))
                        }
                        className="h-7 w-7 shrink-0 rounded-full border border-border text-sm font-medium text-foreground"
                      >
                        −
                      </button>
                      <QuantityInput
                        value={line.quantity}
                        onCommit={(num) => updateQuantity(line.productId, num)}
                      />
                      <button
                        onClick={() =>
                          updateQuantity(line.productId, round2(line.quantity + quantityStep(line.unit)))
                        }
                        className="h-7 w-7 shrink-0 rounded-full border border-border text-sm font-medium text-foreground"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {quantityPresets(line.unit).length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {quantityPresets(line.unit).map((preset) => (
                        <button
                          key={preset}
                          onClick={() => updateQuantity(line.productId, preset)}
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                            line.quantity === preset
                              ? "border-brand bg-brand-soft text-brand-text"
                              : "border-border text-muted"
                          }`}
                        >
                          {presetLabel(preset, line.unit)}
                        </button>
                      ))}
                      {(line.unit === "KG" || line.unit === "LTR") && (
                        <SmallUnitInput
                          unit={line.unit}
                          onCommit={(qty) => updateQuantity(line.productId, qty)}
                        />
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between rounded-lg bg-brand-soft px-3.5 py-2.5 text-sm">
              <span className="text-brand-text">{t("bill.subtotal")}</span>
              <span className="font-semibold text-brand-text">
                {formatMoney(totals.subtotal)}
              </span>
            </div>
            {basketBuddy && (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-brand/40 px-3 py-2 text-sm">
                <Sparkles size={14} className="shrink-0 text-brand-text" />
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {t("bill.basketBuddy", { name: basketBuddy.name })}
                </span>
                <button
                  type="button"
                  onClick={() => addProduct(basketBuddy)}
                  className="shrink-0 rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-white"
                >
                  {t("bill.basketBuddy.add")}
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedSuggestions((p) => new Set(p).add(basketBuddy.id))}
                  className="shrink-0 text-muted"
                  aria-label={t("Dismiss")}
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <div ref={cartEndRef} className="pb-32 md:pb-0" />
          </section>
        )}
      </div>

        <aside className="neu-card sticky top-24 hidden flex-col gap-3 p-4 md:flex" aria-label={t("Bill summary")}>
          <p className="text-sm font-semibold text-foreground">{t("Bill summary")}</p>
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted">{t("bill.customer")}</span>
              <span className="truncate font-medium text-foreground">
                {customerMode === "existing" ? selectedCustomer?.name ?? "—" : t("bill.walkin")}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted">{t("Items")}</span>
              <span className="font-medium text-foreground">{cart.length}</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2 border-t border-border pt-3">
            <span className="text-sm text-muted">{t("bill.subtotal")}</span>
            <span className="text-2xl font-bold tracking-tight text-foreground">{formatMoney(totals.subtotal)}</span>
          </div>
          <p className="text-xs text-muted">{t("GST, discount and payment come next.")}</p>
          <button disabled={!canComplete} onClick={complete} className="btn-primary w-full disabled:opacity-40">
            {t("bill.completeTicket")} →
          </button>
        </aside>

        <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] z-20 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur-md md:hidden">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-3 md:max-w-5xl xl:max-w-6xl">
            <div className="min-w-0">
              <p className="text-xs text-muted">{t("bill.subtotal")}</p>
              <p className="truncate text-lg font-bold text-foreground">{formatMoney(totals.subtotal)}</p>
            </div>
            <button disabled={!canComplete} onClick={complete} className="btn-primary shrink-0 px-6 text-center disabled:opacity-40">
              {t("bill.completeTicket")} →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Complete Ticket screen: GST + discount entered here, before the invoice is generated ---
  const payload = JSON.stringify({
    customerId: customerMode === "existing" ? selectedCustomer?.id ?? null : null,
    quotationId: fromQuote?.id ?? null,
    challanIds: fromChallans?.ids,
    goldSchemeId: fromScheme?.id ?? null,
    walletAmount: walletUse > 0 ? walletUse : null,
    items: cart.map((c) => ({
      productId: c.productId === "__transport_charge__" || c.productId.startsWith("__jewellery_") || c.productId.startsWith("__quote_") || c.packageId ? null : c.productId,
      packageId: c.packageId ?? null,
      providerName: lineProviders[c.productId] || undefined,
      description: c.name,
      hsnCode: c.hsnCode,
      quantity: c.quantity,
      unitPrice: c.price,
      gstPercent: c.gstPercent,
      stockQuantity: c.saleMode === "loose" && c.unitsPerPack ? round2(c.quantity / c.unitsPerPack) : c.quantity,
      priceOverride: c.priceOverride || undefined,
    })),
    discountType,
    discountValue: discountType === "flat" ? discountValue + redemptionValue : discountValue,
    redeemedPoints: discountType === "flat" && redeemPoints ? redeemedPointsCount : 0,
    paidAmount: typeof paidAmount === "number" ? paidAmount : 0,
    paymentMethod,
    doctorName,
    patientName,
    tripVehicleId: tripInfo?.vehicleId ?? null,
    tripKm: tripInfo?.km ?? null,
    tripDriverName: tripInfo?.driverName ?? "",
    tripLoadWeight: tripInfo?.loadWeight ?? null,
    tripLoadUnit: tripInfo?.loadUnit ?? "",
    serviceProviderName,
    exchangeMetal: exchangeInfo?.metal ?? null,
    exchangeDescription: exchangeInfo?.description ?? "",
    exchangeGrossWeight: exchangeInfo?.grossWeight ?? null,
    exchangePurityPercent: exchangeInfo?.purityPercent ?? null,
    exchangeRatePerGram: exchangeInfo?.ratePerGram ?? null,
    exchangeValue: exchangeInfo?.value ?? null,
    ...(b2bAvailable
      ? { b2b: b2bOn, buyerName: b2bOn ? buyer.name : "", buyerGstin: b2bOn ? buyer.gstin : "", buyerAddress: b2bOn ? buyer.address : "" }
      : {}),
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="payload" value={payload} />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setStep("cart")}
          className="text-sm text-muted"
        >
          {t("bill.backToCart")}
        </button>
      </div>
      <h1 className="text-lg font-bold tracking-tight text-foreground md:text-2xl">{t("bill.completeTicket")}</h1>

      <section className="neu-card p-4">
        <p className="text-sm font-medium text-foreground">
          {customerMode === "existing"
            ? selectedCustomer?.name
            : businessType === "clinic"
              ? "Walk-in patient"
              : businessType === "gym"
                ? "Walk-in member"
                : t("common.walkinCustomer")}
        </p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {cart.map((line) => (
            <li key={line.productId} className="flex justify-between text-sm">
              <span className="min-w-0 flex-1 truncate text-muted">
                {line.name} × {line.quantity}
                {freeOf(line) > 0 ? ` (${t("{n} free", { n: freeOf(line) })})` : ""}
              </span>
              <span className="shrink-0 text-foreground">
                {formatMoney(line.price * (line.quantity - freeOf(line)))}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {b2bAvailable && (
        <section className="neu-card flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">{t("B2B invoice (with the buyer's GSTIN)")}</p>
              <p className="text-xs text-muted">{t("For a business that will claim the GST back. It can be a different company than the customer — like their employer.")}</p>
            </div>
            <button
              type="button"
              onClick={() => setB2bOn((on) => !on)}
              role="switch"
              aria-checked={b2bOn}
              aria-label={t("B2B invoice")}
              className={`relative h-8 w-14 shrink-0 rounded-full p-1 transition-colors ${b2bOn ? "bg-brand-soft" : ""}`}
              style={{ boxShadow: "var(--elev-inset)" }}
            >
              <span
                className={`absolute left-1 top-1 h-6 w-6 rounded-full transition-transform ${b2bOn ? "translate-x-6 bg-brand" : "translate-x-0 bg-background"}`}
                style={{ boxShadow: "var(--elev-xs)" }}
              />
            </button>
          </div>
          {b2bOn && (
            <div className="flex flex-col gap-2.5">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                {t("Business name (as registered)")}
                <input
                  value={buyer.name}
                  onChange={(e) => setBuyer((b) => ({ ...b, name: e.target.value }))}
                  placeholder={t("e.g. ABC Traders Pvt Ltd")}
                  className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm font-normal text-foreground outline-none focus:border-brand"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                GSTIN
                <input
                  value={buyer.gstin}
                  onChange={(e) => setBuyer((b) => ({ ...b, gstin: e.target.value.toUpperCase().replace(/s/g, "").slice(0, 15) }))}
                  placeholder="27ABCDE1234F1Z5"
                  autoCapitalize="characters"
                  className="rounded-lg border border-border bg-surface px-3.5 py-2.5 font-mono text-sm font-normal uppercase text-foreground outline-none focus:border-brand"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                {t("Billing address (optional)")}
                <input
                  value={buyer.address}
                  onChange={(e) => setBuyer((b) => ({ ...b, address: e.target.value }))}
                  placeholder={t("Company address for the invoice")}
                  className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm font-normal text-foreground outline-none focus:border-brand"
                />
              </label>
              {buyer.gstin.length > 0 && !buyerGstinValid ? (
                <p className="text-xs text-danger">{t("Check the GSTIN — it should be 15 characters, like 27ABCDE1234F1Z5.")}</p>
              ) : buyerGstinValid ? (
                <p className="text-xs text-muted">
                  {INDIAN_STATES.find((st) => st.code === buyer.gstin.slice(0, 2))?.name ?? buyer.gstin.slice(0, 2)} ·{" "}
                  {supplyType === "inter" ? t("another state, so IGST") : t("same state, so CGST + SGST")}
                </p>
              ) : null}
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3 neu-card p-4">
        <p className="text-sm font-medium text-foreground">{t("bill.discount")}</p>
        {!shopContext.canDiscount && <p className="text-xs text-muted">{t("Only loyalty points can be taken off — ask the owner to allow discounts for your login.")}</p>}
        {shopContext.canDiscount && (<>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDiscountType("flat")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
              discountType === "flat"
                ? "border-brand bg-brand-soft text-brand-text"
                : "border-border text-muted"
            }`}
          >
            {t("bill.flatAmount")}
          </button>
          <button
            type="button"
            onClick={() => setDiscountType("percent")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
              discountType === "percent"
                ? "border-brand bg-brand-soft text-brand-text"
                : "border-border text-muted"
            }`}
          >
            {t("bill.percentage")}
          </button>
        </div>
        <input
          type="number"
          min="0"
          max={discountType === "percent" ? 100 : undefined}
          step="0.01"
          value={discountValue || ""}
          onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
          placeholder={discountType === "flat" ? "e.g. 20" : "e.g. 10"}
          className="rounded-lg border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand"
        />
        </>)}

        {customerMode === "existing" && selectedCustomer && (selectedCustomer.loyalty_points ?? 0) > 0 && (
          <p className="text-xs font-medium text-brand-text">
            {t("bill.loyaltyHas", { name: selectedCustomer.name, points: selectedCustomer.loyalty_points ?? 0 })}
          </p>
        )}

        {customerMode === "existing" && networkReliability && networkReliability.shopsVisited >= 2 && (
          <p
            className={`flex items-center gap-1 text-xs font-medium ${networkReliability.tier === "trusted" ? "text-success" : "text-muted"}`}
          >
            {networkReliability.tier === "trusted" ? "🌟" : "🔹"} Known at {networkReliability.shopsVisited} shops on The Ray
            {networkReliability.tier === "trusted" ? " — reliably settles udhar" : ""}
          </p>
        )}

        {customerMode === "existing" &&
          selectedCustomer &&
          (selectedCustomer.loyalty_points ?? 0) > 0 &&
          loyaltyRedemptionValue > 0 &&
          (discountType === "flat" ? (
            <label className="flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-2.5 text-sm">
              <input type="checkbox" checked={redeemPoints} onChange={(e) => setRedeemPoints(e.target.checked)} className="h-4 w-4" />
              <span className="text-brand-text">
                Redeem {redeemedPointsCount || selectedCustomer.loyalty_points} points for {formatMoney(redemptionValue || (selectedCustomer.loyalty_points ?? 0) * loyaltyRedemptionValue)} off
              </span>
            </label>
          ) : (
            <p className="text-xs text-muted">
              {selectedCustomer.name} has {selectedCustomer.loyalty_points} points — switch to &quot;Flat amount&quot; above to redeem them.
            </p>
          ))}
      </section>

      <section className="neu-card flex flex-col gap-2 p-4 text-sm">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            {supplyType === "intra" ? t("bill.localSale") : t("bill.interStateSale")}
          </span>
        </div>
        <Row label={t("bill.subtotal")} value={formatMoney(totals.subtotal)} />
        <Row label={t("bill.discount")} value={`− ${formatMoney(totals.discountAmount)}`} />
        <Row label={t("bill.taxableValue")} value={formatMoney(totals.taxableAmount)} />
        {supplyType === "intra" ? (
          <>
            <Row label="CGST" value={`+ ${formatMoney(totals.cgstAmount)}`} />
            <Row label="SGST" value={`+ ${formatMoney(totals.sgstAmount)}`} />
          </>
        ) : (
          <Row label="IGST" value={`+ ${formatMoney(totals.igstAmount)}`} />
        )}
        <div className="my-1 h-px bg-border" />
        {totals.roundOffAmount !== 0 && (
          <Row
            label="Round off"
            value={`${totals.roundOffAmount > 0 ? "+ " : "− "}${formatMoney(Math.abs(totals.roundOffAmount))}`}
          />
        )}
        <Row label={t("bill.total")} value={formatMoney(totals.total)} bold />
      </section>

      {businessType === "jewellery" && (
        <ExchangeCalculator
          exchangeInfo={exchangeInfo}
          pureRates={{ gold: goldRates["24K"], silver: silverRate }}
          // Old gold handed over pays part of the bill, so the cash still to be paid goes down by its value
          // (the server adds the exchange value to the cash paid, so it is never counted twice).
          onSet={(info) => {
            setExchangeInfo(info);
            setPaidAmount((prev) => Math.max(0, (typeof prev === "number" ? prev : 0) - info.value));
          }}
          onClear={() => {
            if (exchangeInfo) {
              setPaidAmount((prev) => Math.min(totals.total, (typeof prev === "number" ? prev : 0) + exchangeInfo.value));
            }
            setExchangeInfo(null);
          }}
        />
      )}

      {fromScheme && (
        <section className="flex items-center justify-between gap-3 rounded-xl border border-brand bg-brand-soft px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-brand-text">{t("Gold scheme {number}", { number: fromScheme.number })}</p>
            <p className="text-xs text-brand-text/80">{fromScheme.complete ? t("Instalments + bonus, used for this jewellery") : t("Instalments paid so far (no bonus yet)")}</p>
          </div>
          <p className="shrink-0 text-base font-bold text-brand-text">− {formatMoney(fromScheme.value)}</p>
        </section>
      )}

      {extras && extras.wallet > 0 && (
        <section className="flex items-center justify-between gap-3 rounded-xl border border-brand bg-brand-soft px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-brand-text">{t("Prepaid balance")}</p>
            <p className="text-xs text-brand-text/80">
              {walletUse > 0
                ? t("{used} used · {left} stays", { used: formatMoney(walletUse), left: formatMoney(round2(extras.wallet - walletUse)) })
                : t("{amount} available", { amount: formatMoney(extras.wallet) })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const cash = typeof paidAmount === "number" ? paidAmount : 0;
              if (walletUse > 0) {
                setPaidAmount(round2(cash + walletUse));
                setWalletUse(0);
                return;
              }
              const use = round2(Math.min(extras.wallet, Math.max(0, totals.total - (exchangeInfo?.value ?? 0) - (fromScheme?.value ?? 0))));
              setWalletUse(use);
              setPaidAmount(round2(Math.max(0, cash - use)));
            }}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${walletUse > 0 ? "bg-brand text-white" : "border border-brand text-brand-text"}`}
          >
            {walletUse > 0 ? `− ${formatMoney(walletUse)} ✓` : t("Pay from it")}
          </button>
        </section>
      )}

      <section className="flex flex-col gap-3 neu-card p-4">
        <p className="text-sm font-medium text-foreground">{t("bill.howMuchPaid")}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPaidAmount(Math.max(0, totals.total - exchangeValue))}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
              typeof paidAmount === "number" && paidAmount + exchangeValue === totals.total
                ? "border-brand bg-brand-soft text-brand-text"
                : "border-border text-muted"
            }`}
          >
            {t("bill.fullyPaid")}
          </button>
          <button
            type="button"
            onClick={() => setPaidAmount(0)}
            disabled={customerMode === "walkin"}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
              paidAmount === 0
                ? "border-danger bg-danger text-white"
                : "border-danger bg-danger-soft text-danger"
            }`}
          >
            {t("bill.fullUdhaar")}
          </button>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">{t("bill.orPartPayment")}</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={paidAmount}
            onChange={(e) =>
              setPaidAmount(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="rounded-lg border border-border px-3.5 py-2.5 text-sm outline-none focus:border-brand"
          />
        </label>

        {typeof paidAmount === "number" && paidAmount > 0 && (
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-sm font-medium text-foreground">
              {t("bill.howWasPaid", { amount: formatMoney(paidAmount) })}
            </p>
            <div className="flex flex-wrap gap-2">
              {(["cash", "card", "upi", "online", "other"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium ${
                    paymentMethod === m
                      ? "border-brand bg-brand-soft text-brand-text"
                      : "border-border text-muted"
                  }`}
                >
                  {t(`bill.${m}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        {totals.balanceAmount > 0 && (
          <p className="text-sm text-credit">
            {t("bill.willAddCredit", { amount: formatMoney(totals.balanceAmount) })}
          </p>
        )}
        {totals.balanceAmount > 0 && credit?.limit != null && credit.balance + totals.balanceAmount > credit.limit && (
          <p className="flex items-start gap-1.5 rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-xs text-danger">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>
              {t("Over the udhaar limit: owes {owes} already, this bill adds {adds} — {total} against a limit of {limit}.", {
                owes: formatMoney(credit.balance),
                adds: formatMoney(totals.balanceAmount),
                total: formatMoney(round2(credit.balance + totals.balanceAmount)),
                limit: formatMoney(credit.limit),
              })}
            </span>
          </p>
        )}

        {ewayGoodsValue > 50000 && (
          <p className="flex items-start gap-1.5 rounded-lg border border-credit/25 bg-credit-soft px-3.5 py-2.5 text-xs text-credit">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {tripInfo
              ? t("This delivery carries goods worth over ₹50,000 — an e-way bill is legally required before the vehicle leaves. Generate it on ewaybillgst.gov.in.")
              : supplyType === "inter"
                ? t("Goods worth over ₹50,000 going to another state need an e-way bill before they are moved. Generate it on ewaybillgst.gov.in before dispatch.")
                : t("Goods worth over ₹50,000 need an e-way bill before they are moved by vehicle (within some states the limit is ₹1 lakh). Generate it on ewaybillgst.gov.in before dispatch.")}
          </p>
        )}

        {businessType === "salon" && (
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">{t("Stylist / staff")}</span>
            {stylists.length > 0 && (
              <select
                value={otherStylist ? "__other" : serviceProviderName}
                onChange={(e) => {
                  if (e.target.value === "__other") {
                    setOtherStylist(true);
                    setServiceProviderName("");
                  } else {
                    setOtherStylist(false);
                    setServiceProviderName(e.target.value);
                  }
                }}
                aria-label={t("Stylist / staff")}
                className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand"
              >
                <option value="">{t("— Who did it? —")}</option>
                {stylists.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value="__other">{t("Someone else…")}</option>
              </select>
            )}
            {(stylists.length === 0 || otherStylist) && (
              <input
                value={serviceProviderName}
                onChange={(e) => setServiceProviderName(e.target.value)}
                placeholder={t("Who performed the service?")}
                className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand"
              />
            )}
            {stylists.length === 0 && (
              <Link href="/staff-attendance/people" className="text-xs text-brand-text">
                {t("Add your stylists (with their commission %) in Staff attendance → People →")}
              </Link>
            )}
            {stylists.length > 0 && cart.length > 1 && (
              <details className="rounded-lg border border-border bg-surface px-3 py-2" open={Object.values(lineProviders).some(Boolean)}>
                <summary className="cursor-pointer text-xs font-medium text-brand-text">{t("Someone else did part of it?")}</summary>
                <div className="mt-2 flex flex-col gap-1.5">
                  {cart.map((line) => (
                    <label key={line.productId} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate text-foreground">{line.name}</span>
                      <select
                        value={lineProviders[line.productId] ?? ""}
                        onChange={(e) => setLineProviders((prev) => ({ ...prev, [line.productId]: e.target.value }))}
                        className="w-32 shrink-0 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-brand"
                      >
                        <option value="">{serviceProviderName ? t("Same ({name})", { name: serviceProviderName }) : t("Same as above")}</option>
                        {stylists.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {cart.some((c) => c.requiresPrescription) && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
            <p className="flex items-start gap-1.5 text-xs font-medium text-brand-text">
              <Pill size={13} className="mt-0.5 shrink-0" />
              One or more items need a prescription (Rx) — enter both before generating the invoice.
            </p>
            <input
              value={doctorName}
              onChange={(e) => setDoctorName(e.target.value)}
              placeholder="Doctor's name"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <input
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Patient's name"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
        )}
        {totals.balanceAmount > 0 && customerMode === "walkin" && (
          <p className="text-sm text-credit">
            {t("bill.walkinNoCredit")}
          </p>
        )}
      </section>

      {state?.error && (
        <p className="rounded-lg bg-credit-soft px-3 py-2 text-sm text-credit">
          {state.error}
        </p>
      )}

      <SubmitButton blocked={(customerMode === "walkin" && totals.balanceAmount > 0) || b2bInvalid} generatingLabel={t("bill.generating")} submitLabel={t("bill.generateInvoice")} />

      {/* Not selling yet — the customer wants a price first. Same cart, saved as a quotation. */}
      {ordersAvailable && !fromQuote && customerMode === "existing" && selectedCustomer && (
        <div className="flex flex-col gap-2 rounded-xl border border-brand bg-brand-soft p-3">
          <p className="text-xs text-brand-text">{t("Taking an order on the route? Save it now — the office bills it when the goods go out.")}</p>
          <button
            type="button"
            disabled={quoteSaving}
            onClick={async () => {
              setQuoteError(null);
              setQuoteSaving(true);
              const r = await saveQuotationAction(payload, 0, "", "order");
              setQuoteSaving(false);
              if (r.error || !r.quotationId) setQuoteError(r.error ?? "Could not save");
              else router.push("/orders");
            }}
            className="btn-primary text-center disabled:opacity-60"
          >
            {quoteSaving ? t("Saving…") : t("Save as order")}
          </button>
        </div>
      )}
      {quotationsAvailable && !fromQuote && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3">
          <p className="text-xs text-muted">{t("Customer only wants a price for now?")}</p>
          <div className="flex items-center gap-2">
            <select value={quoteDays} onChange={(e) => setQuoteDays(Number(e.target.value))} className="rounded-lg border border-border px-2 py-2 text-xs outline-none focus:border-brand" aria-label={t("Valid for")}>
              {[7, 15, 30, 60].map((d) => (
                <option key={d} value={d}>
                  {t("Valid {n} days", { n: d })}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={quoteSaving}
              onClick={async () => {
                setQuoteError(null);
                setQuoteSaving(true);
                const r = await saveQuotationAction(payload, quoteDays, "");
                setQuoteSaving(false);
                if (r.error || !r.quotationId) setQuoteError(r.error ?? "Could not save");
                else router.push(`/print/quotation/${r.quotationId}`);
              }}
              className="flex-1 rounded-lg border border-brand bg-brand-soft px-3 py-2 text-sm font-medium text-brand-text disabled:opacity-60"
            >
              {quoteSaving ? t("Saving…") : t("Save as quotation")}
            </button>
          </div>
          {quoteError && <p className="text-xs text-danger">{quoteError}</p>}
        </div>
      )}
      {fromQuote && <p className="text-center text-xs text-muted">{t("Billing quotation {number}", { number: fromQuote.number })}</p>}
      {fromChallans && <p className="text-center text-xs text-muted">{t("Billing challan(s) {numbers}", { numbers: fromChallans.numbers.join(", ") })}</p>}
    </form>
  );
}

/** A quotation's lines back in the cart: catalogue items (loose where a loose share was quoted) at
 * the quoted price while the quotation is valid, else as they are sold today; anything else as the
 * line typed. The server prices the bill again by the same rule. */
function cartFromQuote(lines: QuotationLine[], products: Product[], honourPrices: boolean): CartLine[] {
  return lines.map((l, i) => {
    const p = l.productId ? products.find((x) => x.id === l.productId) : undefined;
    if (!p) {
      return {
        productId: `__quote_${i}__`,
        name: l.description,
        price: l.unitPrice,
        packPrice: l.unitPrice,
        gstPercent: l.gstPercent,
        hsnCode: l.hsnCode,
        unit: "item",
        quantity: l.quantity,
        trackInventory: false,
        stockQuantity: 0,
        lowStockThreshold: 0,
        requiresPrescription: false,
        unitsPerPack: null,
        looseUnitName: null,
        saleMode: "pack",
        regularPrice: l.unitPrice,
        bulkMinQty: null,
        bulkPrice: null,
      };
    }
    const loose = !!p.unitsPerPack && p.unitsPerPack > 1 && l.stockQuantity !== l.quantity;
    const bulk = !loose && p.bulkMinQty && p.bulkPrice && l.quantity >= p.bulkMinQty ? p.bulkPrice : null;
    const today = loose && p.unitsPerPack ? round2(p.price / p.unitsPerPack) : (bulk ?? p.price);
    return {
      productId: p.id,
      name: p.name,
      price: honourPrices ? l.unitPrice : today,
      // Kept through quantity changes, like any promised price.
      priceOverride: honourPrices || undefined,
      packPrice: p.price,
      gstPercent: p.gstPercent,
      hsnCode: p.hsnCode,
      unit: p.unit,
      quantity: l.quantity,
      trackInventory: p.trackInventory,
      stockQuantity: p.stockQuantity,
      lowStockThreshold: p.lowStockThreshold,
      requiresPrescription: p.requiresPrescription,
      unitsPerPack: p.unitsPerPack,
      looseUnitName: p.looseUnitName,
      saleMode: loose ? "loose" : "pack",
      regularPrice: p.price,
      bulkMinQty: p.bulkMinQty,
      bulkPrice: p.bulkPrice,
    };
  });
}

/** How much +/- should move by for a given unit — whole items step by 1,
 * kg/litre step by half, gram/ml step by 50 (since those are already the
 * "small" unit, half a gram isn't a realistic increment). */
function quantityStep(unit: string): number {
  if (unit === "KG" || unit === "LTR") return 0.5;
  if (unit === "GM" || unit === "ML") return 50;
  return 1;
}

/** Quick-tap presets for common partial amounts — e.g. a customer asking
 * for "500 grams" or "half a litre" shouldn't require typing decimals. */
function quantityPresets(unit: string): number[] {
  if (unit === "KG" || unit === "LTR") return [0.25, 0.5, 1, 2, 5];
  if (unit === "GM" || unit === "ML") return [100, 250, 500, 1000];
  return [];
}

/** Shows remaining stock right in the cart, color-coded so a low/about-to-
 * run-out item is obvious without switching to the Products screen:
 * red = at or under the low-stock threshold, orange = within 3 units of it. */
function StockIndicator({
  remaining,
  threshold,
  unit,
}: {
  remaining: number;
  threshold: number;
  unit: string;
}) {
  const isLow = remaining <= threshold;
  const isNearLow = !isLow && remaining <= threshold + 3;

  if (remaining <= 0) {
    return (
      <p className="flex items-center gap-1 text-xs font-semibold text-danger">
        {/* eslint-disable-next-line @next/next/no-img-element -- small branded SVG icon */}
        <img src="/assets/ray-icons/stock-out.svg" alt="" className="h-3.5 w-3.5" /> Out of stock after this sale
      </p>
    );
  }
  if (isLow) {
    return (
      <p className="text-xs font-semibold text-danger">
        ● Low stock: {remaining} {unit} left
      </p>
    );
  }
  if (isNearLow) {
    return (
      <p className="text-xs font-medium" style={{ color: "#c2760f" }}>
        ● {remaining} {unit} left — getting low
      </p>
    );
  }
  return (
    <p className="text-xs text-muted">
      {remaining} {unit} in stock
    </p>
  );
}

function presetLabel(value: number, unit: string): string {
  if ((unit === "KG" || unit === "LTR") && value < 1) {
    return `${value * 1000}${unit === "KG" ? "g" : "ml"}`;
  }
  return `${value}${unit === "KG" ? "kg" : unit === "LTR" ? "L" : unit.toLowerCase()}`;
}

/** A plain controlled `<input value={n}>` fights the user the moment they
 * backspace to clear it — React immediately snaps it back to the last
 * number, since "" isn't a valid quantity yet. This keeps its own text
 * buffer so clearing/retyping feels normal, and only commits the parsed
 * number to the cart on blur (or Enter). */
function QuantityInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  function commit() {
    const num = Number(text);
    if (text.trim() !== "" && !Number.isNaN(num) && num > 0) {
      onCommit(round2(num));
    } else {
      setText(String(value)); // invalid/empty — revert rather than silently zeroing the line
    }
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      step="0.01"
      min="0"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="w-14 rounded-lg border border-border px-1 py-1 text-center text-sm font-medium text-foreground outline-none focus:border-brand"
    />
  );
}

/** Free-text grams/ml entry for KG/LTR products — applies on blur (tapping
 * away) as well as Enter, so it doesn't force an extra keypress on mobile. */
function SmallUnitInput({ unit, onCommit }: { unit: "KG" | "LTR"; onCommit: (qty: number) => void }) {
  const [text, setText] = useState("");

  function commit() {
    const small = Number(text);
    if (text.trim() !== "" && !Number.isNaN(small) && small > 0) {
      // 3-decimal precision — needed for things like 1 gram of saffron
      // (0.001kg), which the usual 2dp rounding would otherwise zero out.
      onCommit(Math.round((small / 1000) * 1000) / 1000);
    }
    setText("");
  }

  return (
    <div className="flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-1">
      <input
        type="number"
        inputMode="decimal"
        placeholder={unit === "KG" ? "e.g. 1" : "e.g. 5"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-12 bg-transparent text-xs outline-none"
      />
      <span className="text-xs text-muted">{unit === "KG" ? "g" : "ml"}</span>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={bold ? "font-semibold text-foreground" : "text-muted"}>{label}</span>
      <span className={bold ? "font-semibold text-foreground neu-text" : "text-foreground"}>
        {value}
      </span>
    </div>
  );
}

function TransportChargePicker({
  vehicles,
  onAdd,
}: {
  vehicles: { id: string; name: string; ratePerKm: number }[];
  onAdd: (
    vehicleId: string,
    vehicleName: string,
    km: number,
    ratePerKm: number,
    driverName: string,
    loadWeight: number | null,
    loadUnit: string,
  ) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [km, setKm] = useState<number | "">("");
  const [driverName, setDriverName] = useState("");
  const [loadWeight, setLoadWeight] = useState<number | "">("");
  const [loadUnit, setLoadUnit] = useState("TON");

  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const charge = vehicle && typeof km === "number" ? Math.round(km * vehicle.ratePerKm * 100) / 100 : null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 self-start rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-brand-text"
      >
        <Truck size={13} /> {t("Add transport charge")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <select
        value={vehicleId}
        onChange={(e) => setVehicleId(e.target.value)}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      >
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} — {formatMoney(v.ratePerKm)}/km
          </option>
        ))}
      </select>
      <input
        type="number"
        min={0}
        step="0.1"
        value={km}
        onChange={(e) => setKm(e.target.value === "" ? "" : Number(e.target.value))}
        placeholder="Distance covered (km)"
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      />
      <input
        value={driverName}
        onChange={(e) => setDriverName(e.target.value)}
        placeholder="Driver name (optional)"
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          min={0}
          step="0.01"
          value={loadWeight}
          onChange={(e) => setLoadWeight(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder="Load carried (optional)"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <select
          value={loadUnit}
          onChange={(e) => setLoadUnit(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        >
          <option value="TON">Ton</option>
          <option value="QTL">Quintal</option>
          <option value="KG">Kg</option>
          <option value="CFT">Cu. ft</option>
        </select>
      </div>
      {charge !== null && <p className="text-xs text-brand-text">Transport charge: {formatMoney(charge)}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!vehicle || typeof km !== "number" || km <= 0}
          onClick={() => {
            if (!vehicle || typeof km !== "number") return;
            onAdd(vehicle.id, vehicle.name, km, vehicle.ratePerKm, driverName, typeof loadWeight === "number" ? loadWeight : null, loadUnit);
            setOpen(false);
            setKm("");
            setDriverName("");
            setLoadWeight("");
          }}
          className="btn-primary-sm disabled:opacity-60"
        >
          Add to bill
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}

function JewelleryCalculator({
  products,
  goldRates,
  silverRate,
  lang,
  priceIncludesGst,
  onAdd,
}: {
  products: Product[];
  goldRates: Record<Karat, number | null>;
  silverRate: number | null;
  lang: Lang;
  priceIncludesGst: boolean;
  onAdd: (name: string, amount: number, gstPercent: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [itemName, setItemName] = useState("");
  const [hallmarkNumber, setHallmarkNumber] = useState("");
  const [karat, setKarat] = useState<Karat>("22K");
  const goldRate = goldRates[karat];
  const [metalType, setMetalType] = useState<"gold" | "silver">(goldRates["22K"] ? "gold" : "silver");
  const [weight, setWeight] = useState<number | "">("");
  const [makingChargeType, setMakingChargeType] = useState<"per_gram" | "flat" | "percent">("per_gram");
  const [makingChargeValue, setMakingChargeValue] = useState<number | "">("");
  const [wastagePercent, setWastagePercent] = useState<number | "">("");
  const [gstPercent, setGstPercent] = useState<number | "">(3);

  function selectProduct(p: Product) {
    setItemName(p.name);
    if (p.hallmarkNumber) setHallmarkNumber(p.hallmarkNumber);
    if (p.metalType) setMetalType(p.metalType);
    // The design's purity picks the rate: an 18K piece at the 18K rate, not the 22K one.
    const k = karatOf(p.purity);
    if (k) setKarat(k);
    if (p.makingChargeType) setMakingChargeType(p.makingChargeType);
    if (p.makingChargeValue != null) setMakingChargeValue(p.makingChargeValue);
    if (p.wastagePercent != null) setWastagePercent(p.wastagePercent);
    setGstPercent(p.gstPercent);
  }

  const rate = metalType === "gold" ? goldRate : silverRate;
  const w = typeof weight === "number" ? weight : 0;
  const metalValue = rate ? round2(w * rate) : 0;
  const wastageAmount = wastagePercent ? round2(metalValue * (Number(wastagePercent) / 100)) : 0;
  const makingCharge =
    makingChargeType === "per_gram"
      ? round2(w * (Number(makingChargeValue) || 0))
      : makingChargeType === "flat"
        ? Number(makingChargeValue) || 0
        : round2((metalValue + wastageAmount) * ((Number(makingChargeValue) || 0) / 100));
  const total = round2(metalValue + wastageAmount + makingCharge);
  // Metal at today's rate plus making is the price before GST — jewellery GST (3%) is added on top.
  // A shop that prices "GST inclusive" gets the line with the GST already in it, so the bill
  // backs out exactly this GST instead of taking 3% out of the jeweller's own price.
  const gst = typeof gstPercent === "number" ? gstPercent : 0;
  const gstAmount = round2(total * (gst / 100));
  const priceWithGst = round2(total + gstAmount);

  function round2(n: number) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 self-start text-sm font-medium text-brand">
        <Gem size={15} /> Add jewellery item by weight
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <p className="text-xs text-brand-text">
        Today&apos;s rate — {goldRate ? `Gold ${karat} ₹${goldRate}/g` : `Gold ${karat} not set`}
        {silverRate ? ` · Silver ₹${silverRate}/g` : ""}
      </p>

      <SearchableSelect
        lang={lang}
        items={products}
        getKey={(p) => p.id}
        getLabel={(p) => p.name}
        getSubLabel={(p) => p.purity ?? ""}
        onSelect={selectProduct}
        placeholder="Pick a saved design (optional)"
      />

      <input
        value={itemName}
        onChange={(e) => setItemName(e.target.value)}
        placeholder="Item name (e.g. Gold ring, 22K)"
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      />
      <input
        value={hallmarkNumber}
        onChange={(e) => setHallmarkNumber(e.target.value)}
        placeholder="Hallmark / HUID number (optional)"
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      />

      <div className="grid grid-cols-2 gap-2">
        <div className="flex gap-1.5">
          <select
            value={metalType}
            onChange={(e) => setMetalType(e.target.value as "gold" | "silver")}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-2 text-sm outline-none focus:border-brand"
          >
            <option value="gold">Gold</option>
            <option value="silver">Silver</option>
          </select>
          {metalType === "gold" && (
            <select value={karat} onChange={(e) => setKarat(e.target.value as Karat)} aria-label="Karat" className="w-[4.5rem] rounded-lg border border-border bg-surface px-1.5 py-2 text-sm outline-none focus:border-brand">
              {KARATS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          )}
        </div>
        <input
          type="number"
          min={0}
          step="0.001"
          value={weight}
          onChange={(e) => setWeight(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder="Weight (grams)"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <select
          value={makingChargeType}
          onChange={(e) => setMakingChargeType(e.target.value as typeof makingChargeType)}
          className="rounded-lg border border-border bg-surface px-2 py-2 text-xs outline-none focus:border-brand"
        >
          <option value="per_gram">₹/gram</option>
          <option value="flat">Flat ₹</option>
          <option value="percent">%</option>
        </select>
        <input
          type="number"
          min={0}
          step="0.01"
          value={makingChargeValue}
          onChange={(e) => setMakingChargeValue(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder="Making"
          className="rounded-lg border border-border bg-surface px-2 py-2 text-xs outline-none focus:border-brand"
        />
        <input
          type="number"
          min={0}
          max={30}
          step="0.01"
          value={wastagePercent}
          onChange={(e) => setWastagePercent(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder="Wastage %"
          className="rounded-lg border border-border bg-surface px-2 py-2 text-xs outline-none focus:border-brand"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-brand-text">
        GST %
        <input
          type="number"
          min={0}
          max={28}
          step="0.01"
          value={gstPercent}
          onChange={(e) => setGstPercent(e.target.value === "" ? "" : Number(e.target.value))}
          className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-brand"
        />
      </label>

      {rate ? (
        <div className="rounded-lg bg-surface px-3 py-2 text-xs text-foreground">
          <div className="flex justify-between"><span>Metal value ({w}g × ₹{rate}{metalType === "gold" ? ` ${karat}` : ""})</span><span>{formatMoney(metalValue)}</span></div>
          {wastageAmount > 0 && <div className="flex justify-between"><span>Wastage ({wastagePercent}%)</span><span>{formatMoney(wastageAmount)}</span></div>}
          <div className="flex justify-between"><span>Making charge</span><span>{formatMoney(makingCharge)}</span></div>
          <div className="mt-1 flex justify-between border-t border-border pt-1"><span>Before GST</span><span>{formatMoney(total)}</span></div>
          {gstAmount > 0 && <div className="flex justify-between"><span>GST ({gst}%)</span><span>{formatMoney(gstAmount)}</span></div>}
          <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span>{formatMoney(priceWithGst)}</span></div>
        </div>
      ) : (
        <p className="text-xs text-danger">Set today&apos;s {metalType} rate first (More → Jewellery → Today&apos;s rate).</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!rate || !itemName.trim() || w <= 0 || total <= 0}
          onClick={() => {
            // The karat on the invoice line, unless the name already says it.
            const named = metalType === "gold" && !new RegExp(karat, "i").test(itemName) ? `${itemName.trim()} ${karat}` : itemName.trim();
            const fullName = hallmarkNumber.trim() ? `${named} (HUID: ${hallmarkNumber.trim()})` : named;
            onAdd(fullName, priceIncludesGst ? priceWithGst : total, gst);
            setOpen(false);
            setItemName("");
            setHallmarkNumber("");
            setWeight("");
            setMakingChargeValue("");
            setWastagePercent("");
          }}
          className="btn-primary-sm disabled:opacity-60"
        >
          Add to bill
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ExchangeCalculator({
  exchangeInfo,
  pureRates,
  onSet,
  onClear,
}: {
  exchangeInfo: { metal: "gold" | "silver"; description: string; grossWeight: number; purityPercent: number; ratePerGram: number; value: number } | null;
  /** Today's rate for pure metal (24K gold, silver) — what the net weight after purity is worth. */
  pureRates: { gold: number | null; silver: number | null };
  onSet: (info: { metal: "gold" | "silver"; description: string; grossWeight: number; purityPercent: number; ratePerGram: number; value: number }) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [metal, setMetal] = useState<"gold" | "silver">("gold");
  const [description, setDescription] = useState("");
  const [grossWeight, setGrossWeight] = useState<number | "">("");
  const [purityPercent, setPurityPercent] = useState<number | "">(91.6);
  // Starts at today's pure rate; the jeweller can change it (a lower buy-back rate, say).
  const [ratePerGram, setRatePerGram] = useState<number | "">(pureRates.gold ?? "");

  function round2(n: number) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  const gw = typeof grossWeight === "number" ? grossWeight : 0;
  const purity = typeof purityPercent === "number" ? purityPercent : 0;
  const rate = typeof ratePerGram === "number" ? ratePerGram : 0;
  // Fine weight to the milligram, as the scale reads (the server works it out the same way).
  const netWeight = Math.round(gw * (purity / 100) * 1000) / 1000;
  const value = round2(netWeight * rate);

  if (exchangeInfo) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-brand bg-brand-soft px-3.5 py-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-brand-text">
            <Recycle size={14} /> Old {exchangeInfo.metal} exchange {exchangeInfo.description ? `— ${exchangeInfo.description}` : ""}
          </p>
          <p className="text-xs text-brand-text/80">
            {exchangeInfo.grossWeight}g gross · {exchangeInfo.purityPercent}% purity · {formatMoney(exchangeInfo.value)}
          </p>
        </div>
        <button onClick={onClear} className="text-xs font-medium text-danger">
          Remove
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 self-start text-sm font-medium text-brand">
        <Recycle size={15} /> Customer exchanging old gold/silver?
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-semibold text-brand-text">Old gold/silver exchange</p>
      <p className="text-xs text-brand-text/80">
        This value is treated as part of the payment — it reduces what the customer needs to pay in cash, and is kept as a separate record for your own melting/refining books.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={metal}
          onChange={(e) => {
            const next = e.target.value as "gold" | "silver";
            // Switch to the other metal's rate unless the jeweller typed their own.
            if (ratePerGram === "" || ratePerGram === pureRates[metal]) setRatePerGram(pureRates[next] ?? "");
            if (purityPercent === (metal === "gold" ? 91.6 : 92.5)) setPurityPercent(next === "gold" ? 91.6 : 92.5);
            setMetal(next);
          }}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        >
          <option value="gold">Gold</option>
          <option value="silver">Silver</option>
        </select>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Old item (optional)"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <input
          type="number"
          min={0}
          step="0.001"
          value={grossWeight}
          onChange={(e) => setGrossWeight(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder="Weight (g)"
          className="rounded-lg border border-border bg-surface px-2 py-2 text-xs outline-none focus:border-brand"
        />
        <input
          type="number"
          min={0}
          max={100}
          step="0.1"
          value={purityPercent}
          onChange={(e) => setPurityPercent(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder="Purity %"
          className="rounded-lg border border-border bg-surface px-2 py-2 text-xs outline-none focus:border-brand"
        />
        <input
          type="number"
          min={0}
          step="0.01"
          value={ratePerGram}
          onChange={(e) => setRatePerGram(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder={metal === "gold" ? "24K rate ₹/g" : "Rate ₹/g"}
          aria-label={metal === "gold" ? "Pure (24K) rate per gram" : "Silver rate per gram"}
          className="rounded-lg border border-border bg-surface px-2 py-2 text-xs outline-none focus:border-brand"
        />
      </div>
      <p className="text-[11px] text-muted">{metal === "gold" ? "Rate is for pure (24K) gold — the purity % works out the rest." : "Rate is for pure silver — the purity % works out the rest."}</p>

      {netWeight > 0 && (
        <p className="text-xs text-brand-text">
          Net weight (after purity): {netWeight}g × ₹{rate}/g = <strong>{formatMoney(value)}</strong>
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={gw <= 0 || purity <= 0 || rate <= 0}
          onClick={() => {
            onSet({ metal, description: description.trim(), grossWeight: gw, purityPercent: purity, ratePerGram: rate, value });
            setOpen(false);
          }}
          className="btn-primary-sm disabled:opacity-60"
        >
          Apply to payment
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Other brands of the same salt and strength: in stock first, then cheapest. "Give this instead"
 * swaps the bill line for the same quantity. */
function SameSaltPanel({ item, products, cart, onSwap, onClose }: { item: Product | null; products: Product[]; cart: CartLine[]; onSwap: (fromId: string, to: Product) => void; onClose: () => void }) {
  const { t } = useT();
  if (!item) return null;
  const subs = substitutesFor(item, products).slice(0, 6);
  if (!subs.length) return null;
  const out = item.trackInventory && item.stockQuantity <= 0;
  const onBill = cart.some((c) => c.productId === item.id);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-brand bg-brand-soft p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-brand-text">
          <b>{item.name}</b> {out ? t("is out of stock.") : ""} {t("Same salt ({salt}):", { salt: item.salt ?? "" })}
        </p>
        <button type="button" onClick={onClose} aria-label={t("Close")} className="shrink-0 text-muted">
          <X size={15} />
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {subs.map((p) => {
          const inStock = !p.trackInventory || p.stockQuantity > 0;
          return (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{p.name}</p>
                <p className={`text-[11px] ${inStock ? "text-muted" : "text-danger"}`}>
                  {formatMoney(p.price)} · {p.trackInventory ? (inStock ? t("{n} in stock", { n: p.stockQuantity }) : t("out of stock")) : t("in stock")}
                </p>
              </div>
              {onBill && (
                <button type="button" onClick={() => onSwap(item.id, p)} className="shrink-0 rounded-lg border border-brand px-2.5 py-1 text-xs font-semibold text-brand-text">
                  {t("Give this instead")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
