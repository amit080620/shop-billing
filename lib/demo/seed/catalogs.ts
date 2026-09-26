/** Made-up product lists for the retail-style demos. Prices include GST (the demo
 * shops use price-includes-GST, like most Indian counters). */
export type CatalogItem = {
  name: string;
  price: number;
  gst: number;
  hsn?: string;
  unit?: string;
  mrp?: number;
  stock: number;
  low?: number;
  warrantyMonths?: number;
  bulk?: [minQty: number, price: number];
  offer?: [price: number, label: string];
  /** Medicine details (pharmacy demo). */
  /** Precious-metal item: metal, purity, making charge, wastage and hallmark (jewellery demo). */
  metal?: { type: "gold" | "silver"; purity: string; making: ["per_gram" | "flat" | "percent", number]; wastage?: number; hallmark?: string };
  /** Rentable item: rates per period and the refundable deposit (rental demo). */
  rent?: { hourly?: number; daily: number; weekly?: number; monthly?: number; deposit: number };
  pharma?: { salt: string; schedule: "otc" | "h" | "h1" | "x"; rack: string; units?: number; loose?: string; rx?: boolean };
};
export type Catalog = { category: string; items: CatalogItem[] }[];

export const GROCERY: Catalog = [
  {
    category: "Staples",
    items: [
      { name: "Basmati Rice 5kg", price: 620, gst: 5, hsn: "1006", unit: "BAG", stock: 60, low: 10 },
      { name: "Toor Dal 1kg", price: 165, gst: 5, hsn: "0713", unit: "KG", stock: 80, low: 15 },
      { name: "Sugar 1kg", price: 46, gst: 5, hsn: "1701", unit: "KG", stock: 120, low: 20 },
      { name: "Aashirvaad Atta 10kg", price: 465, gst: 5, hsn: "1101", unit: "BAG", stock: 40, low: 8 },
      { name: "Sunflower Oil 1L", price: 145, gst: 5, hsn: "1512", unit: "PKT", stock: 70, low: 12 },
      { name: "Tata Salt 1kg", price: 28, gst: 5, hsn: "2501", unit: "PKT", stock: 100, low: 20 },
    ],
  },
  {
    category: "Dairy",
    items: [
      { name: "Amul Butter 500g", price: 275, gst: 12, hsn: "0405", unit: "PKT", mrp: 285, stock: 30, low: 8 },
      { name: "Amul Milk 500ml", price: 30, gst: 0, hsn: "0401", unit: "PKT", stock: 90, low: 20 },
      { name: "Curd 400g", price: 35, gst: 5, hsn: "0403", unit: "PKT", stock: 40, low: 10 },
      { name: "Paneer 200g", price: 90, gst: 5, hsn: "0406", unit: "PKT", stock: 25, low: 6 },
    ],
  },
  {
    category: "Snacks & Biscuits",
    items: [
      { name: "Parle-G Biscuit 250g", price: 25, gst: 18, hsn: "1905", unit: "PKT", mrp: 30, stock: 150, low: 30 },
      { name: "Lays Classic 52g", price: 20, gst: 12, hsn: "2005", unit: "PKT", stock: 120, low: 25 },
      { name: "Maggi Noodles 4-pack", price: 56, gst: 12, hsn: "1902", unit: "PKT", stock: 80, low: 15 },
      { name: "Good Day Cashew 200g", price: 40, gst: 18, hsn: "1905", unit: "PKT", stock: 60, low: 12 },
    ],
  },
  {
    category: "Beverages",
    items: [
      { name: "Tata Tea Gold 250g", price: 135, gst: 5, hsn: "0902", unit: "PKT", stock: 50, low: 10 },
      { name: "Nescafe Classic 100g", price: 310, gst: 18, hsn: "2101", unit: "JAR", stock: 20, low: 5 },
      { name: "Coca-Cola 750ml", price: 40, gst: 28, hsn: "2202", unit: "BTL", stock: 60, low: 12 },
    ],
  },
  {
    category: "Household & Personal care",
    items: [
      { name: "Surf Excel Easy Wash 1kg", price: 130, gst: 18, hsn: "3402", unit: "PKT", stock: 45, low: 10 },
      { name: "Lifebuoy Soap 100g", price: 32, gst: 18, hsn: "3401", unit: "NOS", stock: 90, low: 20 },
      { name: "Colgate Strong Teeth 150g", price: 89, gst: 18, hsn: "3306", unit: "NOS", stock: 55, low: 12 },
      { name: "Dettol Handwash 200ml", price: 99, gst: 18, hsn: "3401", unit: "BTL", stock: 8, low: 10 },
    ],
  },
];

export const MART: Catalog = [
  ...GROCERY.slice(0, 3).map((g) => ({
    category: g.category,
    items: g.items.map((i) => ({ ...i, mrp: i.mrp ?? Math.round(i.price * 1.08) })),
  })),
  {
    category: "Fruits & Vegetables",
    items: [
      { name: "Onion 1kg", price: 38, gst: 0, hsn: "0703", unit: "KG", stock: 90, low: 20 },
      { name: "Potato 1kg", price: 32, gst: 0, hsn: "0701", unit: "KG", stock: 90, low: 20 },
      { name: "Tomato 1kg", price: 45, gst: 0, hsn: "0702", unit: "KG", stock: 60, low: 15, offer: [39, "Weekend offer"] },
      { name: "Banana 1 dozen", price: 60, gst: 0, hsn: "0803", unit: "DOZ", stock: 40, low: 10 },
    ],
  },
  {
    category: "Frozen & Ready to eat",
    items: [
      { name: "Frozen Green Peas 500g", price: 85, gst: 5, hsn: "0710", unit: "PKT", mrp: 95, stock: 30, low: 8 },
      { name: "MTR Ready Upma 180g", price: 60, gst: 12, hsn: "1904", unit: "PKT", mrp: 65, stock: 40, low: 10 },
      { name: "Kissan Tomato Ketchup 1kg", price: 165, gst: 12, hsn: "2103", unit: "BTL", mrp: 180, stock: 35, low: 8, bulk: [3, 155] },
    ],
  },
  {
    category: "Home & Kitchen",
    items: [
      { name: "Milton Water Bottle 1L", price: 349, gst: 18, hsn: "3924", unit: "NOS", mrp: 499, stock: 25, low: 5, offer: [299, "Diwali deal"] },
      { name: "Prestige Cooker 3L", price: 1799, gst: 18, hsn: "7615", unit: "NOS", mrp: 2350, stock: 9, low: 3, warrantyMonths: 24 },
      { name: "Scotch-Brite Scrub Pad 3pk", price: 65, gst: 18, hsn: "3924", unit: "PKT", mrp: 75, stock: 70, low: 15 },
    ],
  },
  {
    category: "Personal care",
    items: [
      { name: "Dove Shampoo 340ml", price: 299, gst: 18, hsn: "3305", unit: "BTL", mrp: 360, stock: 30, low: 8 },
      { name: "Nivea Body Lotion 400ml", price: 349, gst: 18, hsn: "3304", unit: "BTL", mrp: 420, stock: 22, low: 6 },
      { name: "Gillette Guard Razor", price: 35, gst: 18, hsn: "8212", unit: "NOS", mrp: 40, stock: 4, low: 10 },
    ],
  },
];

export const HARDWARE: Catalog = [
  {
    category: "Plumbing",
    items: [
      { name: "PVC Pipe 1 inch (3m)", price: 165, gst: 18, hsn: "3917", unit: "NOS", stock: 60, low: 12, bulk: [10, 150] },
      { name: "CPVC Elbow 3/4 inch", price: 28, gst: 18, hsn: "3917", unit: "NOS", stock: 200, low: 40 },
      { name: "Brass Tap 1/2 inch", price: 240, gst: 18, hsn: "8481", unit: "NOS", stock: 35, low: 8 },
      { name: "Teflon Tape", price: 15, gst: 18, hsn: "3919", unit: "NOS", stock: 150, low: 30 },
    ],
  },
  {
    category: "Electrical",
    items: [
      { name: "Havells 6A Switch", price: 45, gst: 18, hsn: "8536", unit: "NOS", stock: 150, low: 30 },
      { name: "Polycab Wire 1.5mm (90m)", price: 1650, gst: 18, hsn: "8544", unit: "COIL", stock: 15, low: 4 },
      { name: "Philips LED Bulb 9W", price: 99, gst: 12, hsn: "8539", unit: "NOS", stock: 90, low: 20, warrantyMonths: 12 },
      { name: "Anchor MCB 32A", price: 320, gst: 18, hsn: "8536", unit: "NOS", stock: 25, low: 6, warrantyMonths: 24 },
    ],
  },
  {
    category: "Tools",
    items: [
      { name: "Bosch Drill Machine 500W", price: 2499, gst: 18, hsn: "8467", unit: "NOS", mrp: 3200, stock: 8, low: 2, warrantyMonths: 12 },
      { name: "Stanley Hammer 500g", price: 380, gst: 18, hsn: "8205", unit: "NOS", stock: 20, low: 5 },
      { name: "Taparia Screwdriver Set", price: 350, gst: 18, hsn: "8205", unit: "SET", stock: 18, low: 5 },
      { name: "Measuring Tape 5m", price: 120, gst: 18, hsn: "9017", unit: "NOS", stock: 40, low: 8 },
    ],
  },
  {
    category: "Paints & Adhesives",
    items: [
      { name: "Asian Paints Tractor Emulsion 10L", price: 3450, gst: 18, hsn: "3209", unit: "BKT", stock: 14, low: 4 },
      { name: "Fevicol SH 1kg", price: 210, gst: 18, hsn: "3506", unit: "NOS", stock: 30, low: 8 },
      { name: "Sandpaper Sheet (pack of 5)", price: 55, gst: 18, hsn: "6805", unit: "PKT", stock: 60, low: 12 },
      { name: "Paint Brush 3 inch", price: 95, gst: 18, hsn: "9603", unit: "NOS", stock: 3, low: 10 },
    ],
  },
  {
    category: "Fasteners & Cement",
    items: [
      { name: "Ultratech Cement 50kg", price: 395, gst: 28, hsn: "2523", unit: "BAG", stock: 120, low: 25, bulk: [20, 380] },
      { name: "Wall Plug + Screw Kit", price: 85, gst: 18, hsn: "7318", unit: "PKT", stock: 80, low: 15 },
      { name: "Binding Wire 1kg", price: 78, gst: 18, hsn: "7217", unit: "KG", stock: 45, low: 10 },
    ],
  },
];

export const GENERAL: Catalog = [
  {
    category: "Stationery",
    items: [
      { name: "Classmate Notebook A4 (172 pg)", price: 78, gst: 12, hsn: "4820", unit: "NOS", stock: 90, low: 20 },
      { name: "Reynolds Trimax Pen (pack of 10)", price: 90, gst: 12, hsn: "9608", unit: "PKT", stock: 60, low: 12 },
      { name: "A4 Copier Paper (500 sheets)", price: 320, gst: 12, hsn: "4802", unit: "REAM", stock: 35, low: 8 },
      { name: "Stapler + Pins", price: 95, gst: 18, hsn: "8472", unit: "SET", stock: 25, low: 6 },
    ],
  },
  {
    category: "Gifts & Toys",
    items: [
      { name: "Soft Toy Teddy 12 inch", price: 350, gst: 12, hsn: "9503", unit: "NOS", stock: 18, low: 4 },
      { name: "Birthday Candle Pack", price: 30, gst: 12, hsn: "3406", unit: "PKT", stock: 80, low: 15 },
      { name: "Gift Wrap Paper Roll", price: 40, gst: 12, hsn: "4823", unit: "NOS", stock: 60, low: 12 },
    ],
  },
  {
    category: "Electronics & Accessories",
    items: [
      { name: "Mobile Charger 20W", price: 499, gst: 18, hsn: "8504", unit: "NOS", mrp: 799, stock: 30, low: 6, warrantyMonths: 6 },
      { name: "Boat Earphones", price: 699, gst: 18, hsn: "8518", unit: "NOS", mrp: 1299, stock: 24, low: 5, warrantyMonths: 12 },
      { name: "USB Pen Drive 32GB", price: 420, gst: 18, hsn: "8523", unit: "NOS", stock: 20, low: 5 },
      { name: "Duracell AA Battery (4 pack)", price: 160, gst: 18, hsn: "8506", unit: "PKT", stock: 45, low: 10 },
    ],
  },
  {
    category: "Household",
    items: [
      { name: "Steel Water Bottle 750ml", price: 299, gst: 18, hsn: "7323", unit: "NOS", stock: 26, low: 6 },
      { name: "Plastic Storage Box 10L", price: 220, gst: 18, hsn: "3924", unit: "NOS", stock: 20, low: 5 },
      { name: "Broom (Phool Jhadu)", price: 95, gst: 5, hsn: "9603", unit: "NOS", stock: 40, low: 8 },
      { name: "Extension Board 4-way", price: 375, gst: 18, hsn: "8536", unit: "NOS", stock: 3, low: 6 },
    ],
  },
];
