// The Ray Bill — brand icon pack (37 icons: business actions like
// Print Bill, Payment, Order, Product, Stock In/Out, Customer, Save,
// Delete, Refund, Report, Message, Low Stock, Sync, Success, Error,
// Loading). Distinct from the app's general-purpose lucide-react icon
// set — use RayIcon specifically for these named business actions
// during the module-by-module rollout, not as a blanket icon
// replacement everywhere.

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used below only as a type source (typeof RAY_ICON_NAMES), not as a runtime value
const RAY_ICON_NAMES = [
  "arrow-right",
  "barcode",
  "bell",
  "calendar",
  "cash",
  "customer",
  "dashboard",
  "delete",
  "download",
  "edit",
  "error",
  "filter",
  "gst",
  "inventory",
  "invoice",
  "loading",
  "low-stock",
  "message",
  "minus",
  "order",
  "payment",
  "plus",
  "print-bill",
  "product",
  "refund",
  "report",
  "save",
  "scan",
  "search",
  "settings",
  "share",
  "stock-in",
  "stock-out",
  "success",
  "sync",
  "upload",
  "wallet",
] as const;

export type RayIconName = (typeof RAY_ICON_NAMES)[number];

export function RayIcon({
  name,
  size = 32,
  className = "",
}: {
  name: RayIconName;
  size?: number;
  className?: string;
}) {
  // Note: these icons have built-in SMIL animation (a subtle float),
  // baked into the SVG file itself. Loaded via <img>, that animation
  // can't be paused from this component's CSS/JS — the SVG is an
  // opaque external resource once loaded this way. The motion is
  // small (a few px of movement) and not the kind of large/repeated
  // motion prefers-reduced-motion is primarily meant to guard
  // against, but a fully compliant fix (inline SVG + pauseAnimations())
  // is a reasonable follow-up if this becomes a real concern.
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG with baked-in SMIL animation; next/image would strip/interfere with it
    <img
      src={`/icons/ray/${name}.svg`}
      alt=""
      width={size}
      height={size}
      className={className}
      draggable={false}
    />
  );
}
