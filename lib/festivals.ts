export type Festival = {
  name: string;
  slug: string; // stable id independent of year — so notes/history persist across the yearly date shift
  date: string; // YYYY-MM-DD
  approximate?: boolean; // lunar-calendar festivals shift slightly year to year
  prepHints: string[];
  keywords: string[]; // used to match against the shop's own product names/categories
};

// Confirmed dates for 2026 from Drik Panchang-sourced calendars; 2027 dates
// are early-estimate (lunar calendar, ±1 day) since they depend on moon
// sightings/astronomical calculation closer to the date — re-verify nearer
// the time for anything mission-critical.
export const FESTIVALS: Festival[] = [
  {
    name: "Makar Sankranti / Pongal / Lohri",
    slug: "makar-sankranti",
    date: "2026-01-14",
    prepHints: ["Til-gud (sesame-jaggery) sweets", "Sugarcane", "Kites & string", "Rice, fresh produce for Pongal"],
    keywords: ["til", "gud", "jaggery", "gajak", "chikki", "sugarcane", "kite", "rice", "sesame"],
  },
  {
    name: "Holi",
    slug: "holi",
    date: "2026-03-04",
    prepHints: ["Gulal/colors", "Gujiya & sweets ingredients", "Water guns, pichkari", "Cold drinks, snacks"],
    keywords: ["gulal", "color", "gujiya", "pichkari", "thandai", "cold drink", "snack", "sweet", "mithai"],
  },
  {
    name: "Ugadi / Gudi Padwa (Chaitra Navratri begins)",
    slug: "ugadi",
    date: "2026-03-19",
    prepHints: ["Sugar, neem leaves", "Festive sweets", "New almanac/calendar items"],
    keywords: ["sugar", "neem", "sweet", "mithai", "calendar", "panchang"],
  },
  {
    name: "Eid-ul-Fitr",
    slug: "eid-ul-fitr",
    date: "2026-03-21",
    approximate: true,
    prepHints: ["Sewaiyan, dates, dry fruits", "Gift items", "New clothes accessories"],
    keywords: ["sewai", "seviyan", "date", "khajur", "dry fruit", "dryfruit", "gift", "cloth", "kurta"],
  },
  {
    name: "Ram Navami",
    slug: "ram-navami",
    date: "2026-03-26",
    prepHints: ["Prasad ingredients", "Sweets"],
    keywords: ["prasad", "sweet", "mithai", "coconut", "banana"],
  },
  {
    name: "Akshaya Tritiya",
    slug: "akshaya-tritiya",
    date: "2026-04-19",
    prepHints: ["Gold/silver-adjacent items", "Sweets", "Auspicious-purchase gift items"],
    keywords: ["gold", "silver", "jewel", "sweet", "mithai", "gift"],
  },
  {
    name: "Guru Purnima",
    slug: "guru-purnima",
    date: "2026-07-29",
    prepHints: ["Sweets, gift items for teachers"],
    keywords: ["sweet", "mithai", "gift"],
  },
  {
    name: "Janmashtami",
    slug: "janmashtami",
    date: "2026-09-04",
    prepHints: ["Milk-based sweets", "Dahi-handi items", "Decoration items"],
    keywords: ["milk", "sweet", "mithai", "dahi", "curd", "peda", "decoration", "flower"],
  },
  {
    name: "Ganesh Chaturthi",
    slug: "ganesh-chaturthi",
    date: "2026-09-14",
    prepHints: ["Modak ingredients", "Decoration items", "Sweets", "Eco-friendly idols (if applicable)"],
    keywords: ["modak", "rice flour", "jaggery", "coconut", "decoration", "flower", "sweet", "mithai", "idol"],
  },
  {
    name: "Sharad Navratri begins",
    slug: "sharad-navratri-begins",
    date: "2026-10-11",
    prepHints: ["Fasting foods — sabudana, singhare ka atta, fruits", "Festive clothing accessories", "Garba/dandiya accessories"],
    keywords: ["sabudana", "singhara", "kuttu", "fruit", "fast", "vrat", "cloth", "chaniya", "dandiya", "garba"],
  },
  {
    name: "Dussehra / Vijayadashami",
    slug: "dussehra",
    date: "2026-10-20",
    prepHints: ["Sweets", "Decoration items"],
    keywords: ["sweet", "mithai", "decoration"],
  },
  {
    name: "Diwali",
    slug: "diwali",
    date: "2026-11-08",
    prepHints: ["Sweets & dry fruits", "Diyas & candles", "Gift items & hampers", "Decoration/lighting", "New clothes accessories"],
    keywords: ["sweet", "mithai", "dry fruit", "dryfruit", "diya", "candle", "gift", "hamper", "decoration", "light", "cloth", "cracker"],
  },
  {
    name: "Chhath Puja",
    slug: "chhath-puja",
    date: "2026-11-15",
    prepHints: ["Fruits", "Sugarcane", "Thekua ingredients", "Prasad baskets"],
    keywords: ["fruit", "sugarcane", "thekua", "wheat flour", "prasad", "basket"],
  },
  {
    name: "Christmas",
    slug: "christmas",
    date: "2026-12-25",
    prepHints: ["Cakes & baking items", "Gifts", "Decoration items"],
    keywords: ["cake", "baking", "gift", "decoration", "chocolate"],
  },
  {
    name: "Makar Sankranti / Pongal / Lohri",
    slug: "makar-sankranti",
    date: "2027-01-14",
    prepHints: ["Til-gud (sesame-jaggery) sweets", "Sugarcane", "Kites & string", "Rice, fresh produce for Pongal"],
    keywords: ["til", "gud", "jaggery", "gajak", "chikki", "sugarcane", "kite", "rice", "sesame"],
  },
  {
    name: "Maha Shivaratri",
    slug: "maha-shivaratri",
    date: "2027-03-05",
    approximate: true,
    prepHints: ["Prasad ingredients", "Fasting food items"],
    keywords: ["prasad", "fast", "vrat", "fruit", "sabudana"],
  },
  {
    name: "Holi",
    slug: "holi",
    date: "2027-03-22",
    approximate: true,
    prepHints: ["Gulal/colors", "Gujiya & sweets ingredients", "Water guns, pichkari"],
    keywords: ["gulal", "color", "gujiya", "pichkari", "sweet", "mithai"],
  },
  {
    name: "Ugadi / Gudi Padwa",
    slug: "ugadi",
    date: "2027-04-08",
    approximate: true,
    prepHints: ["Sugar, neem leaves", "Festive sweets"],
    keywords: ["sugar", "neem", "sweet", "mithai"],
  },
  {
    name: "Ram Navami",
    slug: "ram-navami",
    date: "2027-04-14",
    approximate: true,
    prepHints: ["Prasad ingredients", "Sweets"],
    keywords: ["prasad", "sweet", "mithai", "coconut", "banana"],
  },
  {
    name: "Akshaya Tritiya",
    slug: "akshaya-tritiya",
    date: "2027-05-08",
    approximate: true,
    prepHints: ["Gold/silver-adjacent items", "Sweets"],
    keywords: ["gold", "silver", "jewel", "sweet", "mithai"],
  },
  {
    name: "Guru Purnima",
    slug: "guru-purnima",
    date: "2027-07-18",
    approximate: true,
    prepHints: ["Sweets, gift items for teachers"],
    keywords: ["sweet", "mithai", "gift"],
  },
  {
    name: "Janmashtami",
    slug: "janmashtami",
    date: "2027-08-24",
    approximate: true,
    prepHints: ["Milk-based sweets", "Dahi-handi items"],
    keywords: ["milk", "sweet", "mithai", "dahi", "curd", "peda"],
  },
  {
    name: "Ganesh Chaturthi",
    slug: "ganesh-chaturthi",
    date: "2027-09-04",
    approximate: true,
    prepHints: ["Modak ingredients", "Decoration items", "Sweets"],
    keywords: ["modak", "rice flour", "jaggery", "coconut", "decoration", "sweet", "mithai"],
  },
  {
    name: "Sharad Navratri begins",
    slug: "sharad-navratri-begins",
    date: "2027-09-30",
    approximate: true,
    prepHints: ["Fasting foods", "Festive clothing accessories", "Garba/dandiya accessories"],
    keywords: ["sabudana", "singhara", "kuttu", "fruit", "fast", "vrat", "cloth", "dandiya", "garba"],
  },
  {
    name: "Dussehra / Vijayadashami",
    slug: "dussehra",
    date: "2027-10-09",
    approximate: true,
    prepHints: ["Sweets", "Decoration items"],
    keywords: ["sweet", "mithai", "decoration"],
  },
  {
    name: "Diwali",
    slug: "diwali",
    date: "2027-10-28",
    approximate: true,
    prepHints: ["Sweets & dry fruits", "Diyas & candles", "Gift items & hampers", "Decoration/lighting"],
    keywords: ["sweet", "mithai", "dry fruit", "dryfruit", "diya", "candle", "gift", "hamper", "decoration", "light", "cracker"],
  },
];
