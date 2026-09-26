/** How the owner wants the shop name, item table and total line to look on a
 * thermal receipt (Settings → Thermal print settings). One shape shared by the
 * browser/USB receipt (ThermalRenderer), the Bluetooth ESC/POS receipt and the
 * settings screen's live preview. */
export type ThermalAlign = "left" | "center" | "right";

export type ThermalFormat = {
  shopNameBold: boolean;
  shopNameItalic: boolean;
  shopNameSize: number;
  shopNameAlign: ThermalAlign;
  itemsBold: boolean;
  totalBold: boolean;
  totalItalic: boolean;
  totalSize: number;
  totalAlign: ThermalAlign;
};

/** Size steps offered in settings. The number stored in the database is the
 * `level`; `em` is how much bigger than the receipt's base text it prints on
 * screen / through the browser. */
export const THERMAL_SIZE_LEVELS: { level: number; label: string; em: number }[] = [
  { level: 0, label: "Small", em: 0.85 },
  { level: 1, label: "Normal", em: 1 },
  { level: 2, label: "Large", em: 1.25 },
  { level: 3, label: "Larger", em: 1.6 },
  { level: 4, label: "Big", em: 2 },
  { level: 5, label: "Extra big", em: 2.5 },
  { level: 6, label: "Huge", em: 3 },
  { level: 7, label: "Giant", em: 3.5 },
];

export function sizeEm(level: number): number {
  const clamped = Math.min(THERMAL_SIZE_LEVELS.length - 1, Math.max(0, Math.round(Number.isFinite(level) ? level : 1)));
  return THERMAL_SIZE_LEVELS[clamped].em;
}

/** The look a shop gets until it changes anything. */
export const DEFAULT_THERMAL_FORMAT: ThermalFormat = {
  shopNameBold: true,
  shopNameItalic: false,
  shopNameSize: 2,
  shopNameAlign: "center",
  itemsBold: false,
  totalBold: true,
  totalItalic: false,
  totalSize: 2,
  totalAlign: "left",
};

type SavedSettings = {
  t58ShopNameBold: boolean; t58ShopNameItalic: boolean; t58ShopNameSize: number; t58ShopNameAlign: ThermalAlign;
  t58ItemsBold: boolean; t58TotalBold: boolean; t58TotalItalic: boolean; t58TotalSize: number; t58TotalAlign: ThermalAlign;
  t80ShopNameBold: boolean; t80ShopNameItalic: boolean; t80ShopNameSize: number; t80ShopNameAlign: ThermalAlign;
  t80ItemsBold: boolean; t80TotalBold: boolean; t80TotalItalic: boolean; t80TotalSize: number; t80TotalAlign: ThermalAlign;
};

/** Picks the saved settings for one paper width. */
export function thermalFormatFor(settings: SavedSettings, paper: 58 | 80): ThermalFormat {
  return paper === 58
    ? {
        shopNameBold: settings.t58ShopNameBold, shopNameItalic: settings.t58ShopNameItalic, shopNameSize: settings.t58ShopNameSize, shopNameAlign: settings.t58ShopNameAlign,
        itemsBold: settings.t58ItemsBold, totalBold: settings.t58TotalBold, totalItalic: settings.t58TotalItalic, totalSize: settings.t58TotalSize, totalAlign: settings.t58TotalAlign,
      }
    : {
        shopNameBold: settings.t80ShopNameBold, shopNameItalic: settings.t80ShopNameItalic, shopNameSize: settings.t80ShopNameSize, shopNameAlign: settings.t80ShopNameAlign,
        itemsBold: settings.t80ItemsBold, totalBold: settings.t80TotalBold, totalItalic: settings.t80TotalItalic, totalSize: settings.t80TotalSize, totalAlign: settings.t80TotalAlign,
      };
}
