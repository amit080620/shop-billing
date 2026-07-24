import type { Lang } from "./i18n/dictionary";

export type HelpItem = { q: string; a: string };
export type HelpSection = { title: string; items: HelpItem[] };

export const HELP_CONTENT: Record<Lang, HelpSection[]> = {
  en: [
    {
      title: "🏠 Home",
      items: [
        {
          q: "What do the top cards show?",
          a: "Today's sales, last 7 days, outstanding credit (customers who owe you), and payable to vendors (what you owe them). Tap \"Outstanding credit\" to jump straight to the reminders list.",
        },
        {
          q: "What's the 🪔 banner that sometimes appears?",
          a: "A heads-up when a major festival is within 25 days — tap it for restock ideas and a calendar reminder (More → Festival planner). It only shows up when one's actually coming soon.",
        },
        {
          q: "What's the Getting Started checklist?",
          a: "Shows only until you've completed the basics (GST profile, first product, first customer, first bill) — then disappears on its own.",
        },
      ],
    },
    {
      title: "🛒 Sell (new bill)",
      items: [
        {
          q: "Walk-in vs Existing customer?",
          a: "Walk-in means no record is kept of who bought it — fine for a simple cash sale. Choose Existing customer if the sale might involve udhaar (credit), since credit can only be tracked against a real customer record.",
        },
        {
          q: "How do I add products fast?",
          a: "Search by name, scan a barcode with a USB/Bluetooth scanner (tap the scan box), or use 📷 Scan with camera. Don't have the product yet? Use \"+ Add new product\" right there — no need to leave the bill.",
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
      title: "📦 Buy & Inventory",
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
          a: "🟢 Green = comfortably stocked. 🟠 Orange = within a few units of your low-stock threshold. 🔴 Red = at or below it. The same colors show up in the cart while billing, so you'll notice before you oversell something.",
        },
        {
          q: "Can I add my whole catalog at once?",
          a: "Yes — Inventory → \"📥 Bulk import/export\". Download the template, fill it in Excel/Google Sheets, then upload it back. Also useful for periodically exporting your catalog as a backup.",
        },
      ],
    },
    {
      title: "👥 Customers & Vendors",
      items: [
        {
          q: "What's the difference?",
          a: "Customers are people who buy from you (and may owe you money). Vendors are suppliers you buy from (and may owe them money). Each has its own ledger, payment history, and — for regular udhaar customers — a downloadable itemized statement.",
        },
        {
          q: "How do I add someone quickly?",
          a: "On Android Chrome, tap \"📱 Pick from contacts\" to fill in name and phone straight from your phone's contact list — no typing.",
        },
        {
          q: "What's the downloadable statement for?",
          a: "For customers who buy on credit regularly and settle up monthly — it lists every single day's items and every payment, so there's no dispute about what was taken when.",
        },
      ],
    },
    {
      title: "💬 Reminders & Offers",
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
      title: "🔔 Item requests",
      items: [
        {
          q: "What's this for?",
          a: "When a customer asks for something you don't have right now. Log their name/phone, what they want, and any advance taken. When it arrives, tap \"Mark available\" — a WhatsApp button appears with a ready-made \"it's here\" message.",
        },
      ],
    },
    {
      title: "📊 Reports & Daily Summary",
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
      title: "⚙️ Settings & Staff",
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
      title: "🔴 🟡 🟢 Voiding a bill",
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
      title: "🏠 होम",
      items: [
        {
          q: "ऊपर वाले cards क्या दिखाते हैं?",
          a: "आज की बिक्री, पिछले 7 दिन, बकाया उधार (जो customers आपको देने हैं), और सप्लायर को देनदारी। \"बकाया उधार\" पर टैप करके सीधे reminders list पर पहुँच सकते हैं।",
        },
        {
          q: "🪔 वाला banner कभी-कभी क्यों दिखता है?",
          a: "जब कोई बड़ा त्योहार 25 दिन के अंदर आने वाला हो — टैप करके restock सुझाव और calendar reminder पा सकते हैं (More → Festival planner)। सिर्फ़ तभी दिखता है जब कोई त्योहार नज़दीक हो।",
        },
        {
          q: "Getting Started checklist क्या है?",
          a: "जब तक बुनियादी काम पूरे न हों (GST profile, पहला product, पहला customer, पहला bill) — तब तक दिखती है, फिर अपने-आप गायब हो जाती है।",
        },
      ],
    },
    {
      title: "🛒 बेचें (नया बिल)",
      items: [
        {
          q: "Walk-in बनाम Existing customer?",
          a: "Walk-in मतलब कोई record नहीं रखा जाता कि किसने खरीदा — साधारण नकद बिक्री के लिए ठीक है। Existing customer चुनें अगर उधार शामिल हो सकता है, क्योंकि उधार सिर्फ़ असली customer record के खिलाफ़ track हो सकता है।",
        },
        {
          q: "Products जल्दी कैसे जोड़ें?",
          a: "नाम से खोजें, USB/Bluetooth scanner से barcode scan करें (scan box पर टैप करें), या 📷 camera से scan करें। Product अभी catalog में नहीं है? वहीं \"+ नया product जोड़ें\" इस्तेमाल करें — बिल छोड़ने की ज़रूरत नहीं।",
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
      title: "📦 खरीदें और Inventory",
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
          a: "🟢 हरा = आराम से stock है। 🟠 केसरी = आपके low-stock threshold के कुछ ही units करीब। 🔴 लाल = threshold पर या उससे नीचे। बिल बनाते वक़्त cart में भी यही रंग दिखते हैं, तो ज़्यादा बेचने से पहले पता चल जाएगा।",
        },
        {
          q: "क्या पूरा catalog एक साथ जोड़ सकते हैं?",
          a: "हाँ — Inventory → \"📥 Bulk import/export\"। Template download करें, Excel/Google Sheets में भरें, फिर वापस upload करें। समय-समय पर backup के तौर पर catalog export करने के लिए भी काम आता है।",
        },
      ],
    },
    {
      title: "👥 Customers और Vendors",
      items: [
        {
          q: "इनमें क्या फ़र्क़ है?",
          a: "Customers वो लोग हैं जो आपसे खरीदते हैं (और आपको पैसे देने हो सकते हैं)। Vendors वो सप्लायर हैं जिनसे आप खरीदते हैं (और आपको उन्हें देने हो सकते हैं)। हर एक का अपना ledger, payment history, और — नियमित उधार वाले customers के लिए — download करने लायक itemized statement है।",
        },
        {
          q: "किसी को जल्दी कैसे जोड़ें?",
          a: "Android Chrome पर, \"📱 Pick from contacts\" टैप करके सीधे फ़ोन के contacts से नाम और फ़ोन नंबर भर सकते हैं — टाइप करने की ज़रूरत नहीं।",
        },
        {
          q: "Download करने लायक statement किसलिए है?",
          a: "जो customers नियमित उधार पर खरीदते हैं और महीने के अंत में हिसाब करते हैं — उनके लिए हर दिन के items और हर payment की पूरी list होती है, ताकि किसने क्या लिया इस पर कोई विवाद न हो।",
        },
      ],
    },
    {
      title: "💬 Reminders और Offers",
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
      title: "🔔 सामान की माँग",
      items: [
        {
          q: "यह किसलिए है?",
          a: "जब कोई customer कुछ माँगे जो अभी आपके पास नहीं है। उनका नाम/फ़ोन, क्या चाहिए, और कोई advance लिया हो तो वो record करें। सामान आने पर \"Mark available\" दबाएँ — एक WhatsApp बटन आ जाएगा तैयार \"आ गया है\" message के साथ।",
        },
      ],
    },
    {
      title: "📊 Reports और Daily Summary",
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
      title: "⚙️ Settings और Staff",
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
      title: "🔴 🟡 🟢 बिल void करना",
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
      title: "🏠 होम",
      items: [
        {
          q: "वरचे cards काय दाखवतात?",
          a: "आजची विक्री, गेले 7 दिवस, थकीत उधारी (जे ग्राहक तुम्हाला देणे लागतात), आणि पुरवठादारांना द्यायचे. \"थकीत उधारी\" वर टॅप करून थेट reminders list वर जाता येते.",
        },
        {
          q: "🪔 बॅनर कधी कधी का दिसतो?",
          a: "मोठा सण 25 दिवसांच्या आत असेल तेव्हा — टॅप करून साठा-सुचना आणि कॅलेंडर स्मरणपत्र मिळते (More → Festival planner). सण जवळ असेल तेव्हाच दिसतो.",
        },
        {
          q: "Getting Started checklist म्हणजे काय?",
          a: "मूलभूत गोष्टी पूर्ण होईपर्यंत दिसते (GST प्रोफाइल, पहिले उत्पादन, पहिला ग्राहक, पहिले बिल) — नंतर आपोआप नाहीशी होते.",
        },
      ],
    },
    {
      title: "🛒 विक्री करा (नवीन बिल)",
      items: [
        {
          q: "वॉक-इन विरुद्ध सध्याचा ग्राहक?",
          a: "वॉक-इन म्हणजे कोणी विकत घेतले याची नोंद ठेवली जात नाही — साध्या रोख विक्रीसाठी ठीक आहे. उधारी असू शकते तर सध्याचा ग्राहक निवडा, कारण उधारी फक्त खऱ्या ग्राहक नोंदीवर ट्रॅक होते.",
        },
        {
          q: "उत्पादने पटकन कशी जोडायची?",
          a: "नावाने शोधा, USB/Bluetooth स्कॅनरने बारकोड स्कॅन करा (स्कॅन बॉक्सवर टॅप करा), किंवा 📷 कॅमेराने स्कॅन करा. उत्पादन अजून कॅटलॉगमध्ये नाही? तिथेच \"+ नवीन उत्पादन जोडा\" वापरा — बिल सोडायची गरज नाही.",
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
      title: "📦 खरेदी व इन्व्हेंटरी",
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
          a: "🟢 हिरवा = आरामात साठा आहे. 🟠 केशरी = low-stock मर्यादेच्या काही युनिट्स जवळ. 🔴 लाल = मर्यादेवर किंवा त्याखाली. बिल बनवताना कार्टमध्येही हेच रंग दिसतात, त्यामुळे जास्त विकण्याआधी लक्षात येईल.",
        },
        {
          q: "संपूर्ण कॅटलॉग एकाच वेळी जोडता येतो का?",
          a: "होय — Inventory → \"📥 Bulk import/export\". टेम्पलेट डाउनलोड करा, Excel/Google Sheets मध्ये भरा, नंतर परत अपलोड करा. वेळोवेळी कॅटलॉग बॅकअप म्हणून एक्सपोर्ट करण्यासाठीही उपयोगी.",
        },
      ],
    },
    {
      title: "👥 ग्राहक व पुरवठादार",
      items: [
        {
          q: "यांच्यात फरक काय?",
          a: "ग्राहक म्हणजे जे तुमच्याकडून विकत घेतात (आणि तुम्हाला पैसे देणे लागू शकतात). पुरवठादार म्हणजे ज्यांच्याकडून तुम्ही विकत घेता (आणि त्यांना पैसे देणे लागू शकते). प्रत्येकाचे स्वतःचे खाते, पेमेंट इतिहास, आणि — नियमित उधारी ग्राहकांसाठी — डाउनलोड करण्यायोग्य तपशीलवार स्टेटमेंट आहे.",
        },
        {
          q: "कोणाला पटकन कसे जोडायचे?",
          a: "Android Chrome वर, \"📱 Pick from contacts\" टॅप करून थेट फोनच्या contacts मधून नाव आणि फोन नंबर भरता येतो — टाइप करायची गरज नाही.",
        },
        {
          q: "डाउनलोड करण्यायोग्य स्टेटमेंट कशासाठी?",
          a: "जे ग्राहक नियमित उधारीवर खरेदी करतात आणि महिन्याअखेर हिशोब करतात — त्यांच्यासाठी प्रत्येक दिवसाच्या वस्तू आणि प्रत्येक पेमेंटची यादी असते, जेणेकरून कोणी काय घेतले यावर वाद होणार नाही.",
        },
      ],
    },
    {
      title: "💬 स्मरणपत्रे व ऑफर",
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
      title: "🔔 वस्तूंची मागणी",
      items: [
        {
          q: "हे कशासाठी आहे?",
          a: "जेव्हा ग्राहक असे काही मागतो जे सध्या तुमच्याकडे नाही. त्यांचे नाव/फोन, काय हवे, आणि घेतलेला अ‍ॅडव्हान्स नोंदवा. वस्तू आल्यावर \"Mark available\" दाबा — तयार \"आले आहे\" संदेशासह WhatsApp बटण दिसेल.",
        },
      ],
    },
    {
      title: "📊 अहवाल व Daily Summary",
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
      title: "⚙️ Settings व कर्मचारी",
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
      title: "🔴 🟡 🟢 बिल void करणे",
      items: [
        {
          q: "मी थेट बिल edit का करू शकत नाही?",
          a: "एकदा GST बिल क्रमांक जारी झाला की तो शांतपणे बदलणे योग्य नाही — तो आधीच फाइल केलेल्या रिटर्नमध्ये असू शकतो. त्याऐवजी void करा (फक्त मालक, कारणासह) — बिल क्रमांक राखीव राहतो, साठा परत येतो, आणि तो सर्व एकूण व अहवालातून वगळला जातो. विक्री खरोखर झाली असेल, तर नंतर नवीन बरोबर बिल तयार करा.",
        },
      ],
    },
  ],
};
