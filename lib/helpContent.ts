import type { Lang } from "./i18n/dictionary";

export type HelpItem = { q: string; a: string };
export type HelpSection = { title: string; items: HelpItem[] };

export const HELP_CONTENT: Record<Lang, HelpSection[]> = {
  en: [
    {
      title: "Home",
      items: [
        {
          q: "What do the top cards show?",
          a: "Today's sales, last 7 days, outstanding credit (customers who owe you), and payable to vendors (what you owe them). Tap \"Outstanding credit\" to jump straight to the reminders list.",
        },
        {
          q: "What's the banner that sometimes appears?",
          a: "A heads-up when a major festival is within 25 days — tap it for restock ideas and a calendar reminder (More → Festival planner). It only shows up when one's actually coming soon.",
        },
        {
          q: "What's the Getting Started checklist?",
          a: "Shows only until you've completed the basics (GST profile, first product, first customer, first bill) — then disappears on its own.",
        },
      ],
    },
    {
      title: "Sell (new bill)",
      items: [
        {
          q: "Walk-in vs Existing customer?",
          a: "Walk-in means no record is kept of who bought it — fine for a simple cash sale. Choose Existing customer if the sale might involve udhaar (credit), since credit can only be tracked against a real customer record.",
        },
        {
          q: "How do I add products fast?",
          a: "Search by name, scan a barcode with a USB/Bluetooth scanner (tap the scan box), or use Scan with camera. Don't have the product yet? Use \"+ Add new product\" right there — no need to leave the bill.",
        },
        {
          q: "How do I bill 500 grams or half a litre?",
          a: "Tap the quantity number and type a decimal (e.g. 0.5), or use the quick chips (250g / 500g / 1kg) that appear for KG/LTR-priced items. For very small amounts (like 1 gram of saffron), there's a small \"or enter grams\" box next to the chips.",
        },
        {
          q: "What's Complete Ticket?",
          a: "The final step — choose the discount, confirm how much is being paid now (Fully paid / Full udhaar / a part payment), and how that payment was made (cash/card/UPI/etc). Whatever's left over becomes the customer's credit automatically.",
        },
        {
          q: "What happens after I generate the invoice?",
          a: "You land on the printable invoice — with buttons to Print, download as PDF, or send a WhatsApp message to the customer. If there's a balance due and you've set a UPI ID in Settings, a scannable/tappable payment QR appears too.",
        },
      ],
    },
    {
      title: "Buy & Inventory",
      items: [
        {
          q: "What's the difference between Buy and Inventory?",
          a: "Buy (bottom nav) is for logging what you purchased from a vendor — this is your input GST/ITC record. Inventory (More → Inventory) is your product catalog — names, prices, GST%, HSN codes, barcodes, and stock levels.",
        },
        {
          q: "Do I have to track stock for every product?",
          a: "No — tracking is opt-in per product (tick \"Track stock\" when adding/editing one). Products without tracking are treated as always-available.",
        },
        {
          q: "What do the colored stock badges mean?",
          a: "Green = comfortably stocked. Orange = within a few units of your low-stock threshold. Red = at or below it. The same colors show up in the cart while billing, so you'll notice before you oversell something.",
        },
        {
          q: "Can I add my whole catalog at once?",
          a: "Yes — Inventory → \"Bulk import/export\". Download the template, fill it in Excel/Google Sheets, then upload it back. Also useful for periodically exporting your catalog as a backup.",
        },
      ],
    },
    {
      title: "Customers & Vendors",
      items: [
        {
          q: "What's the difference?",
          a: "Customers are people who buy from you (and may owe you money). Vendors are suppliers you buy from (and may owe them money). Each has its own ledger, payment history, and — for regular udhaar customers — a downloadable itemized statement.",
        },
        {
          q: "How do I add someone quickly?",
          a: "On Android Chrome, tap \"Pick from contacts\" to fill in name and phone straight from your phone's contact list — no typing.",
        },
        {
          q: "What's the downloadable statement for?",
          a: "For customers who buy on credit regularly and settle up monthly — it lists every single day's items and every payment, so there's no dispute about what was taken when.",
        },
      ],
    },
    {
      title: "Reminders & Offers",
      items: [
        {
          q: "Why do I still have to tap Send myself?",
          a: "WhatsApp doesn't allow any app to send messages on your behalf automatically — that's a WhatsApp platform rule, not a limitation of this app. These screens get you as close to one-tap as possible: select who you need (or Select all), then work through the list quickly.",
        },
        {
          q: "What does the days-pending badge mean?",
          a: "How long the customer's oldest unpaid bill has been outstanding, assuming payments settle the oldest debt first. Green = fresh (under 10 days), orange = 10–29 days, red = 30+ days.",
        },
      ],
    },
    {
      title: "Item requests",
      items: [
        {
          q: "What's this for?",
          a: "When a customer asks for something you don't have right now. Log their name/phone, what they want, and any advance taken. When it arrives, tap \"Mark available\" — a WhatsApp button appears with a ready-made \"it's here\" message.",
        },
      ],
    },
    {
      title: "Reports & Daily Summary",
      items: [
        {
          q: "What are GSTR-1, GSTR-3B, and the Purchase Register?",
          a: "These mirror the tables the actual GST portal uses. GSTR-1 covers your sales (B2B, B2C, HSN summary). GSTR-3B is the monthly summary (output tax, ITC, net payable). The Purchase Register is your input-tax-credit record. None of these file anything automatically — export to CSV and enter them on the portal yourself, or hand them to your CA.",
        },
        {
          q: "What's Daily Summary for?",
          a: "End-of-day cash reconciliation. It breaks down every rupee that moved today — sales collected, old udhaar collected, purchases paid, vendor payments made — by payment method, and gives you one number: expected cash in the drawer.",
        },
        {
          q: "What's Insights?",
          a: "Fast-moving products (last 30 days) and dead stock (tracked items with no sale in 60+ days) — built from your own sales data, not an external AI service.",
        },
      ],
    },
    {
      title: "️ Settings & Staff",
      items: [
        {
          q: "Why is my shop's state required?",
          a: "It decides whether a sale is CGST+SGST (same state as the customer) or IGST (different state) — required by law to get right, so billing is blocked until it's set.",
        },
        {
          q: "What's the UPI ID for?",
          a: "If set, invoices with an outstanding balance show a scannable/tappable payment QR code, so the customer can pay you directly from the printed or shared bill.",
        },
        {
          q: "How do I add another staff member?",
          a: "More → Staff (owner only) → Add staff. You set their email and a temporary password, which they use to log in — scoped to the same shop, with either Staff or Owner role.",
        },
      ],
    },
    {
      title: "Offline billing",
      items: [
        {
          q: "What is this, in plain terms?",
          a: "A separate, lightweight billing screen (More → Offline billing) that keeps working even with zero internet — for when your connection drops mid-day and you still need to sell. Normal billing (the Sell tab) can't work offline at all, since it talks to the server for every action.",
        },
        {
          q: "What do I need to do BEFORE the internet goes out?",
          a: "Nothing extra — just use the app normally. Every time you open the Sell screen while online, it quietly saves a fresh copy of your products, customers, and shop details onto your phone. Also open More → Offline billing at least once while online, so that screen itself is saved and can open later with no connection.",
        },
        {
          q: "How do I know it's ready?",
          a: "Open More → Offline billing while online — if it shows your shop name and lets you search products, it's ready. If it says \"open the app online first\", it hasn't cached anything yet — just browse the Sell screen once and try again.",
        },
        {
          q: "What happens when I make a bill while offline?",
          a: "You build the cart exactly like normal billing — search cached products, pick a customer or leave it as walk-in, choose payment method. When you save it, you get a provisional receipt (item list and total) — but NOT a real GST invoice number yet, since that has to come from the server in the correct sequence.",
        },
        {
          q: "Is the provisional receipt good enough to give the customer?",
          a: "Yes, for the moment — it shows what was bought and the total. It's clearly marked provisional. Once it syncs, you can print/share the real, final invoice with its proper GST number.",
        },
        {
          q: "How does it become a real invoice?",
          a: "As soon as your phone has internet again, open More → Offline billing and tap \"Sync now\" (or it may sync automatically). Each waiting bill is sent to the server in the order it was created, gets the next real sequential invoice number, and updates your stock — exactly as if you'd billed it online.",
        },
        {
          q: "What if something goes wrong during sync?",
          a: "That one bill stays marked \"failed, will retry\" in the pending list — nothing is lost. Fix whatever caused it (e.g. a product was deleted since) if needed, then tap Sync now again.",
        },
        {
          q: "What are the real limitations I should know?",
          a: "Stock levels and prices reflect the last time you were online — if two staff members are both selling the same low-stock item while offline, you could oversell it. There's no barcode camera scanner in the offline screen yet, only text search. And you must have opened the Sell and Offline billing screens online at least once on THIS device before it can work with no connection.",
        },
      ],
    },
    {
      title: "Restaurant — Tables & orders",
      items: [
        {
          q: "How do I start an order?",
          a: "Tap a free (green) table on the Tables screen — it opens a new order for that table and marks it occupied. Search the menu and tap an item to add it; tap again to add another one. Tap an occupied (red) table any time to reopen its order and keep adding.",
        },
        {
          q: "What does Print KOT actually send?",
          a: "Only the items added since the last KOT for that table — so if you print, then add two more dishes later, the second KOT shows just those two, not the whole order again. This is what stops the kitchen from re-cooking something already on the stove.",
        },
        {
          q: "What's the Kitchen tab / Kitchen Display?",
          a: "A full-screen, no-app-chrome view meant for a TV or tablet sitting in the kitchen — every open table's ticket, color-coded by how long it's been waiting (green under 10 minutes, orange 10–20, red 20+). It refreshes itself every few seconds, so nobody needs to keep printing paper KOTs.",
        },
        {
          q: "How do I remove a wrongly-added item?",
          a: "Tap the next to it in the order screen — no PIN needed, since correcting a mistake is a normal part of taking orders. A PIN is only required to cancel the entire table's order.",
        },
        {
          q: "What's the Manager PIN for?",
          a: "It's needed to cancel a started order (the whole table, not a single item) — deliberately a separate PIN from the owner's login password, set under Settings → Restaurant, so staff never need real account credentials just to void something with a supervisor's approval.",
        },
        {
          q: "How does Settle work?",
          a: "Tap Settle on an order, apply a discount if needed, then enter the payment — split it across cash, card, UPI, etc. if the customer's paying more than one way. Whatever's short of the total becomes credit against that customer, same as a regular bill.",
        },
        {
          q: "Dine-in, Takeaway, Delivery — what's that toggle for?",
          a: "Marks how the order is being served, for your own records and future reporting. It doesn't change how billing or KOT works.",
        },
      ],
    },
    {
      title: "Rental — Bookings & returns",
      items: [
        {
          q: "How do I make an item rentable?",
          a: "In Inventory, edit the item and tick \"Also available for rent\" — then set a rate for whichever durations you actually rent by (hourly/daily/weekly/monthly) and, if you take one, a security deposit.",
        },
        {
          q: "How does the app stop double-booking?",
          a: "Every time you book, it checks every other booking for that same item whose dates overlap the ones you're entering, and only lets you book what's actually free for that window. If you ask for more than what's available, it tells you the exact number free instead.",
        },
        {
          q: "What happens to the security deposit?",
          a: "It's collected at booking time and held separately from the rental charge (no GST applies to it, since it's refundable, not a sale). When the item is returned, any damage charge is deducted from it automatically, and the remainder is refunded. If damage costs more than the deposit, the difference becomes credit owed by the customer.",
        },
        {
          q: "How do I process a return?",
          a: "Open the rental and tap Process return — mark each item's condition (good/damaged/missing), add a damage charge or late fee if applicable, and confirm. The item becomes available to book again immediately.",
        },
        {
          q: "Where do past rentals go?",
          a: "More → Rentals → Rental history shows everything that's been returned or cancelled, most recent first.",
        },
      ],
    },
    {
      title: "Voiding a bill",
      items: [
        {
          q: "Why can't I just edit a bill?",
          a: "Once a GST invoice number is issued, it shouldn't be silently rewritten — it may already be reflected in a filed return. Instead, void it (owner only, with a reason) — the invoice number stays reserved, stock is restored, and it's excluded from every total and report. If the sale genuinely happened, create a fresh corrected invoice afterward.",
        },
      ],
    },
  ],
  hi: [
    {
      title: "होम",
      items: [
        {
          q: "ऊपर वाले cards क्या दिखाते हैं?",
          a: "आज की बिक्री, पिछले 7 दिन, बकाया उधार (जो customers आपको देने हैं), और सप्लायर को देनदारी। \"बकाया उधार\" पर टैप करके सीधे reminders list पर पहुँच सकते हैं।",
        },
        {
          q: "वाला banner कभी-कभी क्यों दिखता है?",
          a: "जब कोई बड़ा त्योहार 25 दिन के अंदर आने वाला हो — टैप करके restock सुझाव और calendar reminder पा सकते हैं (More → Festival planner)। सिर्फ़ तभी दिखता है जब कोई त्योहार नज़दीक हो।",
        },
        {
          q: "Getting Started checklist क्या है?",
          a: "जब तक बुनियादी काम पूरे न हों (GST profile, पहला product, पहला customer, पहला bill) — तब तक दिखती है, फिर अपने-आप गायब हो जाती है।",
        },
      ],
    },
    {
      title: "बेचें (नया बिल)",
      items: [
        {
          q: "Walk-in बनाम Existing customer?",
          a: "Walk-in मतलब कोई record नहीं रखा जाता कि किसने खरीदा — साधारण नकद बिक्री के लिए ठीक है। Existing customer चुनें अगर उधार शामिल हो सकता है, क्योंकि उधार सिर्फ़ असली customer record के खिलाफ़ track हो सकता है।",
        },
        {
          q: "Products जल्दी कैसे जोड़ें?",
          a: "नाम से खोजें, USB/Bluetooth scanner से barcode scan करें (scan box पर टैप करें), या camera से scan करें। Product अभी catalog में नहीं है? वहीं \"+ नया product जोड़ें\" इस्तेमाल करें — बिल छोड़ने की ज़रूरत नहीं।",
        },
        {
          q: "500 ग्राम या आधा लीटर कैसे बिल करें?",
          a: "Quantity number पर टैप करके decimal टाइप करें (जैसे 0.5), या KG/LTR वाले items के लिए quick chips (250g / 500g / 1kg) इस्तेमाल करें। बहुत छोटी मात्रा के लिए (जैसे 1 ग्राम केसर), chips के बगल में एक छोटा \"grams में डालें\" box है।",
        },
        {
          q: "Complete Ticket क्या है?",
          a: "आखिरी कदम — discount चुनें, अभी कितना भुगतान हो रहा है पक्का करें (पूरा भुगतान / पूरा उधार / कुछ हिस्सा), और वो कैसे दिया गया (cash/card/UPI वगैरह)। जो बचेगा वो customer के उधार में अपने-आप जुड़ जाएगा।",
        },
        {
          q: "Invoice बनने के बाद क्या होता है?",
          a: "Print करने लायक invoice खुल जाता है — Print, PDF download, या customer को WhatsApp भेजने के बटन के साथ। अगर कुछ बकाया है और Settings में UPI ID सेट है, तो एक scan/tap करने लायक payment QR भी दिखेगा।",
        },
      ],
    },
    {
      title: "खरीदें और Inventory",
      items: [
        {
          q: "Buy और Inventory में क्या फ़र्क़ है?",
          a: "Buy (bottom nav) — vendor से जो खरीदा उसे record करने के लिए, यह आपका input GST/ITC record है। Inventory (More → Inventory) — आपका product catalog है — नाम, price, GST%, HSN code, barcode, और stock levels।",
        },
        {
          q: "क्या हर product का stock track करना ज़रूरी है?",
          a: "नहीं — यह हर product पर अलग से चुनना होता है (\"Track stock\" पर टिक करें जब जोड़ें/बदलें)। बिना tracking वाले products हमेशा उपलब्ध माने जाते हैं।",
        },
        {
          q: "रंगीन stock badges का क्या मतलब है?",
          a: "हरा = आराम से stock है। केसरी = आपके low-stock threshold के कुछ ही units करीब। लाल = threshold पर या उससे नीचे। बिल बनाते वक़्त cart में भी यही रंग दिखते हैं, तो ज़्यादा बेचने से पहले पता चल जाएगा।",
        },
        {
          q: "क्या पूरा catalog एक साथ जोड़ सकते हैं?",
          a: "हाँ — Inventory → \"Bulk import/export\"। Template download करें, Excel/Google Sheets में भरें, फिर वापस upload करें। समय-समय पर backup के तौर पर catalog export करने के लिए भी काम आता है।",
        },
      ],
    },
    {
      title: "Customers और Vendors",
      items: [
        {
          q: "इनमें क्या फ़र्क़ है?",
          a: "Customers वो लोग हैं जो आपसे खरीदते हैं (और आपको पैसे देने हो सकते हैं)। Vendors वो सप्लायर हैं जिनसे आप खरीदते हैं (और आपको उन्हें देने हो सकते हैं)। हर एक का अपना ledger, payment history, और — नियमित उधार वाले customers के लिए — download करने लायक itemized statement है।",
        },
        {
          q: "किसी को जल्दी कैसे जोड़ें?",
          a: "Android Chrome पर, \"Pick from contacts\" टैप करके सीधे फ़ोन के contacts से नाम और फ़ोन नंबर भर सकते हैं — टाइप करने की ज़रूरत नहीं।",
        },
        {
          q: "Download करने लायक statement किसलिए है?",
          a: "जो customers नियमित उधार पर खरीदते हैं और महीने के अंत में हिसाब करते हैं — उनके लिए हर दिन के items और हर payment की पूरी list होती है, ताकि किसने क्या लिया इस पर कोई विवाद न हो।",
        },
      ],
    },
    {
      title: "Reminders और Offers",
      items: [
        {
          q: "मुझे खुद Send क्यों दबाना पड़ता है?",
          a: "WhatsApp किसी भी app को अपनी तरफ़ से अपने-आप message भेजने की अनुमति नहीं देता — यह WhatsApp का अपना नियम है, इस app की सीमा नहीं। ये screens आपको जितना हो सके one-tap के करीब लाती हैं: जिन्हें चाहिए उन्हें चुनें (या Select all), फिर तेज़ी से list से गुज़रें।",
        },
        {
          q: "Days-pending badge का क्या मतलब है?",
          a: "Customer की सबसे पुरानी बकाया बिल कितने दिन से pending है, यह मानकर कि payments सबसे पुराना उधार पहले चुकाती हैं। हरा = ताज़ा (10 दिन से कम), केसरी = 10–29 दिन, लाल = 30+ दिन।",
        },
      ],
    },
    {
      title: "सामान की माँग",
      items: [
        {
          q: "यह किसलिए है?",
          a: "जब कोई customer कुछ माँगे जो अभी आपके पास नहीं है। उनका नाम/फ़ोन, क्या चाहिए, और कोई advance लिया हो तो वो record करें। सामान आने पर \"Mark available\" दबाएँ — एक WhatsApp बटन आ जाएगा तैयार \"आ गया है\" message के साथ।",
        },
      ],
    },
    {
      title: "Reports और Daily Summary",
      items: [
        {
          q: "GSTR-1, GSTR-3B, और Purchase Register क्या हैं?",
          a: "ये असली GST portal जिन tables का इस्तेमाल करता है, वैसी ही हैं। GSTR-1 आपकी बिक्री (B2B, B2C, HSN summary) दिखाता है। GSTR-3B महीने का सार है (output tax, ITC, net payable)। Purchase Register आपका input-tax-credit record है। इनमें से कोई भी अपने-आप file नहीं होता — CSV export करके खुद portal पर डालें, या अपने CA को दे दें।",
        },
        {
          q: "Daily Summary किसलिए है?",
          a: "दिन के अंत का cash हिसाब। आज जो भी पैसा हिला — बिक्री, पुराना उधार वसूला, खरीद का भुगतान, vendor को दिया गया पैसा — सब payment method के हिसाब से तोड़कर दिखाता है, और एक नंबर देता है: cash drawer में कितना होना चाहिए।",
        },
        {
          q: "Insights क्या है?",
          a: "तेज़ी से बिकने वाले products (पिछले 30 दिन) और dead stock (जो tracked items 60+ दिन से नहीं बिके) — आपके अपने sales data से बना, किसी बाहरी AI service से नहीं।",
        },
      ],
    },
    {
      title: "️ Settings और Staff",
      items: [
        {
          q: "मेरी दुकान का राज्य ज़रूरी क्यों है?",
          a: "यह तय करता है कि बिक्री CGST+SGST है (customer भी उसी राज्य में) या IGST (अलग राज्य) — कानूनन सही होना ज़रूरी है, इसीलिए यह भरे बिना billing नहीं होती।",
        },
        {
          q: "UPI ID किसलिए है?",
          a: "अगर सेट किया हो, तो बकाया वाली invoices पर एक scan/tap करने लायक payment QR दिखता है, ताकि customer print की हुई या भेजी हुई bill से सीधे payment कर सके।",
        },
        {
          q: "एक और staff कैसे जोड़ें?",
          a: "More → Staff (सिर्फ़ owner) → Add staff। उनका email और एक temporary password सेट करें, जिससे वो login करेंगे — उसी दुकान के लिए, Staff या Owner role के साथ।",
        },
      ],
    },
    {
      title: "Offline बिलिंग",
      items: [
        {
          q: "यह असल में है क्या?",
          a: "एक अलग, हल्का billing screen (More → Offline billing) जो बिना internet के भी काम करता है — जब दिन में कभी internet कट जाए और फिर भी बेचना हो। सामान्य billing (Sell tab) offline बिल्कुल काम नहीं करती, क्योंकि वो हर कदम पर server से बात करती है।",
        },
        {
          q: "Internet जाने से पहले क्या करना ज़रूरी है?",
          a: "कुछ अलग से नहीं — बस app को सामान्य तरीके से इस्तेमाल करते रहें। जब भी online रहते हुए Sell पेज खुलता है, आपके products, customers, और दुकान की जानकारी अपने-आप फ़ोन में save होती रहती है। साथ ही More → Offline billing भी online रहते हुए एक बार ज़रूर खोल लें, ताकि वो पेज खुद भी बाद में बिना internet खुल सके।",
        },
        {
          q: "कैसे पता चले यह तैयार है?",
          a: "Online रहते हुए More → Offline billing खोलें — अगर वहाँ आपकी दुकान का नाम दिखे और products खोज सकें, तो तैयार है। अगर \"पहले online app खोलें\" जैसा message दिखे, तो अभी data cache नहीं हुआ — एक बार Sell screen खोलकर फिर कोशिश करें।",
        },
        {
          q: "Offline बिल बनाने पर क्या होता है?",
          a: "बिल्कुल सामान्य billing जैसे ही cart बनाएं — cached products खोजें, customer चुनें या walk-in छोड़ दें, payment method चुनें। Save करने पर एक अस्थायी (provisional) receipt मिलती है — items और total के साथ — पर **असली GST invoice number नहीं** अभी, क्योंकि वो सही क्रम में सिर्फ़ server से ही मिल सकता है।",
        },
        {
          q: "क्या यह अस्थायी receipt customer को देने लायक है?",
          a: "हाँ, फ़िलहाल के लिए — इसमें क्या खरीदा गया और total साफ़ दिखता है, और साफ़ लिखा होता है कि यह अस्थायी है। Sync होने के बाद असली, पूरी invoice (सही GST number के साथ) print/share कर सकते हैं।",
        },
        {
          q: "यह असली invoice कैसे बनती है?",
          a: "जैसे ही फ़ोन में internet वापस आए, More → Offline billing खोलें और \"Sync now\" दबाएँ (या अपने-आप sync हो सकता है)। हर pending बिल उसी क्रम में जिस क्रम में बनी थी, server को भेजी जाती है, असली अगला sequential invoice number मिलता है, और stock update होती है — बिल्कुल वैसे ही जैसे online बिल बनाने पर होता है।",
        },
        {
          q: "अगर sync के दौरान कुछ गड़बड़ हो जाए?",
          a: "वो एक बिल pending list में \"failed, will retry\" के साथ रुकी रहेगी — कुछ भी खोता नहीं। अगर ज़रूरत हो तो वजह ठीक करें (जैसे कोई product तब तक delete हो गया हो), फिर दोबारा Sync now दबाएँ।",
        },
        {
          q: "असली सीमाएँ क्या हैं, जो जान लेनी चाहिए?",
          a: "Stock और price उतने ही ताज़ा हैं जितनी बार आप last online थे — अगर 2 staff members एक ही कम-stock वाला item offline बेच रहे हों, तो ज़्यादा बिक सकता है। Offline screen में अभी camera barcode scan नहीं है, सिर्फ़ text से खोज सकते हैं। और इस डिवाइस पर Sell और Offline billing दोनों को online रहते हुए कम से कम एक बार खोलना ज़रूरी है, तभी बिना internet काम करेगा।",
        },
      ],
    },
    {
      title: "Restaurant — Tables और Orders",
      items: [
        {
          q: "Order कैसे शुरू करें?",
          a: "Tables screen पर किसी खाली (हरी) table पर टैप करें — उसके लिए नया order खुल जाता है और table occupied हो जाती है। Menu खोजें और item पर टैप करके जोड़ें; दोबारा टैप करने से और जुड़ता है। किसी occupied (लाल) table पर कभी भी टैप करके उसका order फिर से खोल सकते हैं।",
        },
        {
          q: "Print KOT असल में क्या भेजता है?",
          a: "सिर्फ़ वही items जो उस table के पिछले KOT के बाद जुड़े हों — तो अगर आपने print किया, फिर बाद में 2 और dish जोड़ीं, दूसरा KOT सिर्फ़ वही 2 दिखाएगा, पूरा order दोबारा नहीं। यही kitchen को already बन रही चीज़ दोबारा बनाने से रोकता है।",
        },
        {
          q: "Kitchen tab / Kitchen Display क्या है?",
          a: "एक पूरी स्क्रीन वाला view, बिना किसी app menu के — किसी TV या tablet के लिए जो kitchen में रखा हो। हर खुली table का ticket, रंग के हिसाब से (हरा 10 मिनट से कम, नारंगी 10-20, लाल 20+ मिनट) — कितनी देर से रुका है दिखाता है। यह अपने-आप हर कुछ सेकंड में update होता रहता है, तो कागज़ पर KOT print करने की ज़रूरत नहीं।",
        },
        {
          q: "गलती से जुड़े item को कैसे हटाएँ?",
          a: "Order screen में उसके बगल में दबाएँ — कोई PIN नहीं चाहिए, क्योंकि गलती ठीक करना सामान्य काम है। PIN सिर्फ़ पूरी table का order cancel करने के लिए चाहिए।",
        },
        {
          q: "Manager PIN किसलिए है?",
          a: "किसी शुरू हो चुकी order को cancel करने के लिए (पूरी table, सिर्फ़ एक item नहीं) — जानबूझकर owner के login password से अलग, Settings → Restaurant में सेट करें, ताकि staff को कभी असली account credentials न जानने पड़ें, सिर्फ़ supervisor की मंज़ूरी से काम हो जाए।",
        },
        {
          q: "Settle कैसे काम करता है?",
          a: "किसी order पर Settle दबाएँ, ज़रूरत हो तो discount लगाएँ, फिर payment डालें — अगर customer एक से ज़्यादा तरीके से पैसे दे रहा है तो cash/card/UPI में बाँट सकते हैं। जो total से कम रह जाए, वो customer के उधार में जुड़ जाता है, सामान्य बिल जैसे ही।",
        },
        {
          q: "Dine-in, Takeaway, Delivery वाला toggle किसलिए है?",
          a: "यह record रखता है कि order कैसे serve हुआ, आपकी अपनी जानकारी और आगे reports के लिए। billing या KOT के काम करने के तरीके में कोई फ़र्क़ नहीं पड़ता।",
        },
      ],
    },
    {
      title: "Rental — Booking और Return",
      items: [
        {
          q: "किसी item को rentable कैसे बनाएँ?",
          a: "Inventory में item edit करें और \"Also available for rent\" टिक करें — फिर जिन duration पर असल में rent करते हैं (hourly/daily/weekly/monthly) उनकी rate भरें, और अगर लेते हैं तो security deposit।",
        },
        {
          q: "App double-booking कैसे रोकता है?",
          a: "जब भी book करें, वो उसी item की हर दूसरी booking से जाँच करता है जिनकी dates overlap होती हैं, और सिर्फ़ उतना ही book होने देता है जितना उस समय के लिए असल में खाली है। अगर उपलब्ध से ज़्यादा माँगें, तो सही उपलब्ध संख्या बता देता है।",
        },
        {
          q: "Security deposit का क्या होता है?",
          a: "यह booking के वक़्त लिया जाता है और rental charge से अलग रखा जाता है (इस पर GST नहीं लगता, क्योंकि यह refundable है, बिक्री नहीं)। सामान वापस आने पर, कोई damage charge अपने-आप deposit से कट जाता है, बाकी वापस मिल जाता है। अगर damage deposit से ज़्यादा हो, तो फ़र्क़ customer के उधार में जुड़ जाता है।",
        },
        {
          q: "Return कैसे process करें?",
          a: "Rental खोलें और Process return दबाएँ — हर item की हालत बताएं (अच्छी/खराब/गुम), ज़रूरत हो तो damage charge या late fee जोड़ें, और confirm करें। Item तुरंत दोबारा book होने लायक हो जाता है।",
        },
        {
          q: "पुरानी rentals कहाँ मिलेंगी?",
          a: "More → Rentals → Rental history में सारी वापस आई या cancel हुई rentals दिखती हैं, सबसे नई सबसे पहले।",
        },
      ],
    },
    {
      title: "बिल void करना",
      items: [
        {
          q: "मैं सीधे बिल edit क्यों नहीं कर सकता?",
          a: "एक बार GST invoice number जारी हो जाए, तो उसे चुपचाप बदलना सही नहीं — हो सकता है वो पहले से किसी filed return में हो। इसकी जगह उसे void करें (सिर्फ़ owner, कारण के साथ) — invoice number reserved रहता है, stock वापस आ जाता है, और वो सभी totals और reports से बाहर हो जाता है। अगर बिक्री genuinely हुई थी, तो बाद में एक नई सही invoice बना दें।",
        },
      ],
    },
  ],
  mr: [
    {
      title: "होम",
      items: [
        {
          q: "वरचे cards काय दाखवतात?",
          a: "आजची विक्री, गेले 7 दिवस, थकीत उधारी (जे ग्राहक तुम्हाला देणे लागतात), आणि पुरवठादारांना द्यायचे. \"थकीत उधारी\" वर टॅप करून थेट reminders list वर जाता येते.",
        },
        {
          q: "बॅनर कधी कधी का दिसतो?",
          a: "मोठा सण 25 दिवसांच्या आत असेल तेव्हा — टॅप करून साठा-सुचना आणि कॅलेंडर स्मरणपत्र मिळते (More → Festival planner). सण जवळ असेल तेव्हाच दिसतो.",
        },
        {
          q: "Getting Started checklist म्हणजे काय?",
          a: "मूलभूत गोष्टी पूर्ण होईपर्यंत दिसते (GST प्रोफाइल, पहिले उत्पादन, पहिला ग्राहक, पहिले बिल) — नंतर आपोआप नाहीशी होते.",
        },
      ],
    },
    {
      title: "विक्री करा (नवीन बिल)",
      items: [
        {
          q: "वॉक-इन विरुद्ध सध्याचा ग्राहक?",
          a: "वॉक-इन म्हणजे कोणी विकत घेतले याची नोंद ठेवली जात नाही — साध्या रोख विक्रीसाठी ठीक आहे. उधारी असू शकते तर सध्याचा ग्राहक निवडा, कारण उधारी फक्त खऱ्या ग्राहक नोंदीवर ट्रॅक होते.",
        },
        {
          q: "उत्पादने पटकन कशी जोडायची?",
          a: "नावाने शोधा, USB/Bluetooth स्कॅनरने बारकोड स्कॅन करा (स्कॅन बॉक्सवर टॅप करा), किंवा कॅमेराने स्कॅन करा. उत्पादन अजून कॅटलॉगमध्ये नाही? तिथेच \"+ नवीन उत्पादन जोडा\" वापरा — बिल सोडायची गरज नाही.",
        },
        {
          q: "500 ग्रॅम किंवा अर्धा लिटर कसे बिल करायचे?",
          a: "प्रमाण क्रमांकावर टॅप करून दशांश टाइप करा (उदा. 0.5), किंवा KG/LTR उत्पादनांसाठी असलेल्या क्विक चिप्स (250g / 500g / 1kg) वापरा. अगदी लहान प्रमाणासाठी (जसे 1 ग्रॅम केशर), चिप्सच्या बाजूला एक छोटा \"ग्रॅममध्ये टाका\" बॉक्स आहे.",
        },
        {
          q: "Complete Ticket म्हणजे काय?",
          a: "शेवटची पायरी — सूट निवडा, आता किती पैसे दिले जात आहेत ते ठरवा (पूर्ण पैसे / पूर्ण उधारी / काही रक्कम), आणि ते कसे दिले (रोख/कार्ड/UPI इ.). जे उरेल ते आपोआप ग्राहकाच्या उधारीत जोडले जाईल.",
        },
        {
          q: "बिल तयार झाल्यावर पुढे काय होते?",
          a: "प्रिंट करण्यायोग्य बिल उघडते — प्रिंट, PDF डाउनलोड, किंवा ग्राहकाला WhatsApp संदेश पाठवण्याचे बटण असते. शिल्लक रक्कम असेल आणि Settings मध्ये UPI ID सेट असेल, तर स्कॅन/टॅप करण्यायोग्य पेमेंट QR सुद्धा दिसतो.",
        },
      ],
    },
    {
      title: "खरेदी व इन्व्हेंटरी",
      items: [
        {
          q: "Buy आणि Inventory मध्ये फरक काय?",
          a: "Buy (bottom nav) — पुरवठादाराकडून काय विकत घेतले याची नोंद करण्यासाठी, हा तुमचा इनपुट GST/ITC रेकॉर्ड आहे. Inventory (More → Inventory) — तुमचा उत्पादन कॅटलॉग — नावे, किमती, GST%, HSN कोड, बारकोड, आणि साठा पातळी.",
        },
        {
          q: "प्रत्येक उत्पादनाचा साठा ट्रॅक करणे गरजेचे आहे का?",
          a: "नाही — हे प्रत्येक उत्पादनासाठी स्वतंत्रपणे निवडायचे असते (\"Track stock\" टिक करा जोडताना/बदलताना). ट्रॅकिंगशिवाय उत्पादने नेहमी उपलब्ध मानली जातात.",
        },
        {
          q: "रंगीत साठा बॅजेसचा अर्थ काय?",
          a: "हिरवा = आरामात साठा आहे. केशरी = low-stock मर्यादेच्या काही युनिट्स जवळ. लाल = मर्यादेवर किंवा त्याखाली. बिल बनवताना कार्टमध्येही हेच रंग दिसतात, त्यामुळे जास्त विकण्याआधी लक्षात येईल.",
        },
        {
          q: "संपूर्ण कॅटलॉग एकाच वेळी जोडता येतो का?",
          a: "होय — Inventory → \"Bulk import/export\". टेम्पलेट डाउनलोड करा, Excel/Google Sheets मध्ये भरा, नंतर परत अपलोड करा. वेळोवेळी कॅटलॉग बॅकअप म्हणून एक्सपोर्ट करण्यासाठीही उपयोगी.",
        },
      ],
    },
    {
      title: "ग्राहक व पुरवठादार",
      items: [
        {
          q: "यांच्यात फरक काय?",
          a: "ग्राहक म्हणजे जे तुमच्याकडून विकत घेतात (आणि तुम्हाला पैसे देणे लागू शकतात). पुरवठादार म्हणजे ज्यांच्याकडून तुम्ही विकत घेता (आणि त्यांना पैसे देणे लागू शकते). प्रत्येकाचे स्वतःचे खाते, पेमेंट इतिहास, आणि — नियमित उधारी ग्राहकांसाठी — डाउनलोड करण्यायोग्य तपशीलवार स्टेटमेंट आहे.",
        },
        {
          q: "कोणाला पटकन कसे जोडायचे?",
          a: "Android Chrome वर, \"Pick from contacts\" टॅप करून थेट फोनच्या contacts मधून नाव आणि फोन नंबर भरता येतो — टाइप करायची गरज नाही.",
        },
        {
          q: "डाउनलोड करण्यायोग्य स्टेटमेंट कशासाठी?",
          a: "जे ग्राहक नियमित उधारीवर खरेदी करतात आणि महिन्याअखेर हिशोब करतात — त्यांच्यासाठी प्रत्येक दिवसाच्या वस्तू आणि प्रत्येक पेमेंटची यादी असते, जेणेकरून कोणी काय घेतले यावर वाद होणार नाही.",
        },
      ],
    },
    {
      title: "स्मरणपत्रे व ऑफर",
      items: [
        {
          q: "मला स्वतः Send का दाबावे लागते?",
          a: "WhatsApp कोणत्याही app ला स्वतःहून संदेश पाठवण्याची परवानगी देत नाही — हा WhatsApp चा नियम आहे, या app ची मर्यादा नाही. या स्क्रीन्स तुम्हाला जास्तीत जास्त एक-टॅप जवळ आणतात: हवे ते निवडा (किंवा Select all), मग पटकन यादीतून जा.",
        },
        {
          q: "Days-pending बॅजचा अर्थ काय?",
          a: "ग्राहकाचे सर्वात जुने न भरलेले बिल किती दिवसांपासून थकीत आहे, असे गृहीत धरून की पेमेंट सर्वात जुनी उधारी आधी फेडते. हिरवा = ताजे (10 दिवसांपेक्षा कमी), केशरी = 10–29 दिवस, लाल = 30+ दिवस.",
        },
      ],
    },
    {
      title: "वस्तूंची मागणी",
      items: [
        {
          q: "हे कशासाठी आहे?",
          a: "जेव्हा ग्राहक असे काही मागतो जे सध्या तुमच्याकडे नाही. त्यांचे नाव/फोन, काय हवे, आणि घेतलेला अ‍ॅडव्हान्स नोंदवा. वस्तू आल्यावर \"Mark available\" दाबा — तयार \"आले आहे\" संदेशासह WhatsApp बटण दिसेल.",
        },
      ],
    },
    {
      title: "अहवाल व Daily Summary",
      items: [
        {
          q: "GSTR-1, GSTR-3B, आणि Purchase Register म्हणजे काय?",
          a: "हे खऱ्या GST पोर्टलच्या टेबल्ससारखेच आहेत. GSTR-1 तुमची विक्री दाखवते (B2B, B2C, HSN सारांश). GSTR-3B महिन्याचा सारांश आहे (आउटपुट टॅक्स, ITC, नक्त देय). Purchase Register तुमचा इनपुट-टॅक्स-क्रेडिट रेकॉर्ड आहे. यापैकी काहीही आपोआप फाइल होत नाही — CSV एक्सपोर्ट करून स्वतः पोर्टलवर टाका, किंवा तुमच्या CA ला द्या.",
        },
        {
          q: "Daily Summary कशासाठी आहे?",
          a: "दिवसअखेरचा रोख हिशोब. आज हललेला प्रत्येक रुपया — विक्री, जुनी उधारी वसूल, खरेदीचे पेमेंट, पुरवठादाराला दिलेले पैसे — पेमेंट पद्धतीनुसार विभागून दाखवते, आणि एक आकडा देते: ड्रॉवरमध्ये किती रोख असायला हवी.",
        },
        {
          q: "Insights म्हणजे काय?",
          a: "वेगाने विकली जाणारी उत्पादने (गेले 30 दिवस) आणि dead stock (60+ दिवस न विकलेली ट्रॅक केलेली उत्पादने) — तुमच्याच विक्री डेटावरून तयार, बाह्य AI सेवेवरून नाही.",
        },
      ],
    },
    {
      title: "️ Settings व कर्मचारी",
      items: [
        {
          q: "माझ्या दुकानाचे राज्य का आवश्यक आहे?",
          a: "विक्री CGST+SGST आहे (ग्राहक त्याच राज्यात) की IGST (वेगळे राज्य) हे हेच ठरवते — कायद्याने बरोबर असणे गरजेचे आहे, म्हणून हे भरल्याशिवाय बिलिंग होत नाही.",
        },
        {
          q: "UPI ID कशासाठी आहे?",
          a: "सेट केले असल्यास, थकीत रक्कम असलेल्या बिलांवर स्कॅन/टॅप करण्यायोग्य पेमेंट QR दिसतो, जेणेकरून ग्राहक प्रिंट किंवा शेअर केलेल्या बिलावरून थेट पेमेंट करू शकेल.",
        },
        {
          q: "आणखी एक कर्मचारी कसा जोडायचा?",
          a: "More → Staff (फक्त मालक) → Add staff. त्यांचा ईमेल आणि तात्पुरता पासवर्ड सेट करा, ज्याने ते लॉग इन करतील — त्याच दुकानासाठी, Staff किंवा Owner भूमिकेसह.",
        },
      ],
    },
    {
      title: "ऑफलाइन बिलिंग",
      items: [
        {
          q: "हे नक्की काय आहे?",
          a: "एक वेगळी, हलकी बिलिंग स्क्रीन (More → Offline billing) जी इंटरनेटशिवायही काम करते — दिवसा कधी इंटरनेट गेले तरी विक्री सुरू ठेवता यावी म्हणून. सामान्य बिलिंग (Sell tab) इंटरनेटशिवाय अजिबात काम करत नाही, कारण ती प्रत्येक पायरीला सर्व्हरशी संपर्क साधते.",
        },
        {
          q: "इंटरनेट जाण्याआधी काय करणे गरजेचे आहे?",
          a: "वेगळे काही नाही — फक्त app नेहमीप्रमाणे वापरत राहा. जेव्हा जेव्हा ऑनलाइन असताना Sell पेज उघडते, तेव्हा तुमची उत्पादने, ग्राहक, आणि दुकानाची माहिती आपोआप फोनमध्ये साठवली जाते. तसेच More → Offline billing सुद्धा ऑनलाइन असताना एकदा उघडा, म्हणजे ते पेजही नंतर इंटरनेटशिवाय उघडू शकेल.",
        },
        {
          q: "हे तयार आहे हे कसे कळेल?",
          a: "ऑनलाइन असताना More → Offline billing उघडा — जर तिथे तुमच्या दुकानाचे नाव दिसले आणि उत्पादने शोधता आली, तर तयार आहे. \"आधी app ऑनलाइन उघडा\" असा संदेश दिसल्यास, अजून डेटा साठवला गेलेला नाही — एकदा Sell स्क्रीन उघडून पुन्हा प्रयत्न करा.",
        },
        {
          q: "ऑफलाइन बिल बनवल्यावर काय होते?",
          a: "अगदी नेहमीसारखेच कार्ट तयार करा — साठवलेली उत्पादने शोधा, ग्राहक निवडा किंवा वॉक-इन ठेवा, पेमेंट पद्धत निवडा. सेव्ह केल्यावर एक तात्पुरती (provisional) पावती मिळते — वस्तू आणि एकूण रकमेसह — पण **खरा GST बिल क्रमांक अजून नाही**, कारण तो योग्य क्रमाने फक्त सर्व्हरकडूनच मिळू शकतो.",
        },
        {
          q: "ही तात्पुरती पावती ग्राहकाला द्यायला पुरेशी आहे का?",
          a: "होय, सध्यापुरती — यात काय विकत घेतले आणि एकूण रक्कम स्पष्ट दिसते, आणि ती तात्पुरती असल्याचे स्पष्ट लिहिलेले असते. Sync झाल्यावर खरे, पूर्ण बिल (योग्य GST क्रमांकासह) प्रिंट/शेअर करता येते.",
        },
        {
          q: "हे खरे बिल कसे बनते?",
          a: "फोनला पुन्हा इंटरनेट मिळताच, More → Offline billing उघडा आणि \"Sync now\" दाबा (किंवा आपोआप sync होऊ शकते). प्रत्येक थांबलेले बिल ज्या क्रमाने तयार झाले त्याच क्रमाने सर्व्हरला पाठवले जाते, त्याला खरा पुढचा क्रमांक मिळतो, आणि साठा अद्ययावत होतो — अगदी ऑनलाइन बिल बनवल्यासारखेच.",
        },
        {
          q: "Sync दरम्यान काही चूक झाली तर?",
          a: "ते एक बिल pending यादीत \"failed, will retry\" सह थांबलेले राहते — काहीही गमावले जात नाही. गरज असल्यास कारण दुरुस्त करा (उदा. एखादे उत्पादन तोपर्यंत डिलीट झाले असेल), मग पुन्हा Sync now दाबा.",
        },
        {
          q: "कोणत्या खऱ्या मर्यादा लक्षात ठेवाव्यात?",
          a: "साठा आणि किंमती तुम्ही शेवटचे ऑनलाइन होता तितक्याच ताज्या असतात — दोन कर्मचारी एकाच कमी-साठा असलेल्या वस्तूची ऑफलाइन विक्री करत असतील, तर जास्त विकली जाऊ शकते. ऑफलाइन स्क्रीनमध्ये अजून कॅमेरा बारकोड स्कॅन नाही, फक्त टेक्स्टने शोधता येते. आणि या डिव्हाइसवर Sell आणि Offline billing दोन्ही ऑनलाइन असताना किमान एकदा उघडलेले असणे गरजेचे आहे, तरच इंटरनेटशिवाय काम करेल.",
        },
      ],
    },
    {
      title: "रेस्टॉरंट — टेबल्स व ऑर्डर्स",
      items: [
        {
          q: "ऑर्डर कशी सुरू करायची?",
          a: "Tables स्क्रीनवर एखाद्या रिकाम्या (हिरव्या) टेबलवर टॅप करा — त्यासाठी नवीन ऑर्डर उघडते आणि टेबल occupied होते. मेनू शोधा आणि आयटमवर टॅप करून जोडा; पुन्हा टॅप केल्यास आणखी एक जोडली जाते. व्यापलेल्या (लाल) टेबलवर कधीही टॅप करून त्याची ऑर्डर पुन्हा उघडता येते.",
        },
        {
          q: "Print KOT नक्की काय पाठवते?",
          a: "फक्त त्या टेबलच्या शेवटच्या KOT नंतर जोडलेले आयटम — म्हणजे तुम्ही प्रिंट केले, नंतर आणखी 2 डिश जोडल्या, तर दुसरे KOT फक्त त्या 2 दाखवते, संपूर्ण ऑर्डर पुन्हा नाही. यामुळेच स्वयंपाकघर आधीच बनत असलेली गोष्ट पुन्हा बनवत नाही.",
        },
        {
          q: "Kitchen टॅब / Kitchen Display म्हणजे काय?",
          a: "स्वयंपाकघरात ठेवलेल्या TV किंवा टॅबलेटसाठी बनवलेले, कोणत्याही app मेनूशिवाय पूर्ण स्क्रीन दृश्य — प्रत्येक उघड्या टेबलचे तिकीट, किती वेळ थांबले आहे त्यानुसार रंगीत (हिरवा 10 मिनिटांखाली, केशरी 10-20, लाल 20+ मिनिटे). हे दर काही सेकंदांनी आपोआप अपडेट होते, त्यामुळे कागदी KOT प्रिंट करायची गरज नाही.",
        },
        {
          q: "चुकून जोडलेला आयटम कसा काढायचा?",
          a: "ऑर्डर स्क्रीनमध्ये त्याच्या बाजूला दाबा — PIN लागत नाही, कारण चूक दुरुस्त करणे हे सामान्य काम आहे. संपूर्ण टेबलची ऑर्डर रद्द करण्यासाठीच PIN लागतो.",
        },
        {
          q: "Manager PIN कशासाठी आहे?",
          a: "सुरू झालेली ऑर्डर रद्द करण्यासाठी (संपूर्ण टेबल, एकच आयटम नाही) — मालकाच्या लॉगिन पासवर्डपेक्षा जाणूनबुजून वेगळे, Settings → Restaurant मध्ये सेट करा, जेणेकरून कर्मचाऱ्यांना कधीही खरे खाते credentials माहित असण्याची गरज नाही, फक्त पर्यवेक्षकाच्या मान्यतेने काम होते.",
        },
        {
          q: "Settle कसे काम करते?",
          a: "ऑर्डरवर Settle दाबा, गरज असल्यास सूट लावा, मग पेमेंट टाका — ग्राहक एकापेक्षा जास्त प्रकारे पैसे देत असेल तर cash/card/UPI मध्ये विभागू शकता. जे एकूण रकमेपेक्षा कमी राहील, ते ग्राहकाच्या उधारीत जोडले जाते, नेहमीच्या बिलासारखेच.",
        },
        {
          q: "Dine-in, Takeaway, Delivery टॉगल कशासाठी आहे?",
          a: "ऑर्डर कशी दिली गेली याची नोंद ठेवते, तुमच्या स्वतःच्या माहितीसाठी आणि पुढील अहवालांसाठी. बिलिंग किंवा KOT काम करण्याच्या पद्धतीत काहीही फरक पडत नाही.",
        },
      ],
    },
    {
      title: "भाड्याने देणे — बुकिंग व परतावा",
      items: [
        {
          q: "एखादी वस्तू rentable कशी बनवायची?",
          a: "Inventory मध्ये वस्तू edit करा आणि \"Also available for rent\" टिक करा — मग तुम्ही ज्या कालावधीनुसार खरोखर भाड्याने देता (hourly/daily/weekly/monthly) त्यांचा दर भरा, आणि घेत असाल तर सुरक्षा ठेव.",
        },
        {
          q: "App दुहेरी-बुकिंग कसे थांबवते?",
          a: "जेव्हाही तुम्ही बुक करता, ते त्याच वस्तूच्या दुसऱ्या प्रत्येक बुकिंगशी तपासते ज्यांच्या तारखा जुळतात, आणि त्या कालावधीसाठी प्रत्यक्षात मोकळे असेल तेवढेच बुक करू देते. उपलब्धतेपेक्षा जास्त मागितल्यास, नेमकी उपलब्ध संख्या सांगते.",
        },
        {
          q: "सुरक्षा ठेवीचे काय होते?",
          a: "ती बुकिंगच्या वेळी घेतली जाते आणि भाड्याच्या रकमेपासून वेगळी ठेवली जाते (यावर GST लागत नाही, कारण ती परत करण्यायोग्य आहे, विक्री नाही). वस्तू परत आल्यावर, कोणताही नुकसान शुल्क आपोआप ठेवीतून वजा होतो, उरलेली रक्कम परत केली जाते. नुकसान ठेवीपेक्षा जास्त असल्यास, फरक ग्राहकाच्या उधारीत जोडला जातो.",
        },
        {
          q: "परतावा कसा process करायचा?",
          a: "भाडे उघडा आणि Process return दाबा — प्रत्येक वस्तूची स्थिती सांगा (चांगली/खराब/गहाळ), गरज असल्यास नुकसान शुल्क किंवा विलंब शुल्क जोडा, आणि पुष्टी करा. वस्तू लगेच पुन्हा बुक करण्यायोग्य होते.",
        },
        {
          q: "जुनी भाडी कुठे मिळतील?",
          a: "More → Rentals → Rental history मध्ये परत आलेली किंवा रद्द झालेली सर्व भाडी दिसतात, सर्वात नवीन आधी.",
        },
      ],
    },
    {
      title: "बिल void करणे",
      items: [
        {
          q: "मी थेट बिल edit का करू शकत नाही?",
          a: "एकदा GST बिल क्रमांक जारी झाला की तो शांतपणे बदलणे योग्य नाही — तो आधीच फाइल केलेल्या रिटर्नमध्ये असू शकतो. त्याऐवजी void करा (फक्त मालक, कारणासह) — बिल क्रमांक राखीव राहतो, साठा परत येतो, आणि तो सर्व एकूण व अहवालातून वगळला जातो. विक्री खरोखर झाली असेल, तर नंतर नवीन बरोबर बिल तयार करा.",
        },
      ],
    },
  ],
};
