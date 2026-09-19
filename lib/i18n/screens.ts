/** Screen text added with the 2026 UI pass, kept as [English, Hindi, Marathi]
 * side by side so a translation is reviewed next to its source. Merged
 * into `translations` by dictionary.ts. */
export const SCREEN_STRINGS: Record<string, [en: string, hi: string, mr: string]> = {
  // Common
  "common.search": ["Search", "खोजें", "शोधा"],
  "common.newBillPlus": ["+ New bill", "+ नया बिल", "+ नवीन बिल"],
  "common.due": ["{amount} due", "{amount} बाकी", "{amount} बाकी"],
  "common.paid": ["Paid", "चुकता", "भरले"],
  "common.voided": ["Voided", "रद्द", "रद्द"],
  "common.back": ["Back", "वापस", "मागे"],
  "common.delete": ["Delete", "हटाएं", "हटवा"],

  // Home
  "home.moneyAtRisk": ["Money at risk", "फंसा हुआ पैसा", "अडकलेले पैसे"],
  "home.seeWhere": ["See where →", "कहाँ, देखें →", "कुठे ते पहा →"],
  "home.allBills": ["All bills", "सभी बिल", "सर्व बिले"],
  "home.daySummary": ["Day summary", "दिन का हिसाब", "दिवसाचा हिशोब"],

  "home.setUp": ["Set up {shop}", "{shop} सेट अप करें", "{shop} सेट अप करा"],
  "home.setupProgress": ["{done} of {total} done", "{total} में से {done} पूरे", "{total} पैकी {done} पूर्ण"],
  "home.addFirst": ["Add your first {item}", "अपना पहला {item} जोड़ें", "आपले पहिले {item} जोडा"],
  "home.addOne": ["Add a {who}", "एक {who} जोड़ें", "एक {who} जोडा"],
  "home.festivalIn": ["{name} in {days} days", "{name} — {days} दिन में", "{name} — {days} दिवसांत"],
  "home.festivalTomorrow": ["{name} tomorrow", "{name} कल", "{name} उद्या"],
  "bill.loyaltyHas": ["🎁 {name} has {points} loyalty points", "🎁 {name} के {points} लॉयल्टी पॉइंट", "🎁 {name} यांचे {points} लॉयल्टी पॉइंट"],

  "daily.moneyIn": ["Money in — {amount}", "आया पैसा — {amount}", "आलेले पैसे — {amount}"],
  "daily.moneyOut": ["Money out — {amount}", "गया पैसा — {amount}", "गेलेले पैसे — {amount}"],

  "profit.uncosted": [
    "{count} item(s) sold in this period have no purchase entry yet, so their cost isn't counted above — record those purchases to see the full picture.",
    "इस अवधि में बिके {count} सामान की खरीद दर्ज नहीं, इसलिए उनकी लागत ऊपर नहीं जुड़ी — पूरी तस्वीर के लिए वो खरीद दर्ज करें।",
    "या कालावधीत विकलेल्या {count} वस्तूंची खरेदी नोंदलेली नाही, म्हणून त्यांची किंमत वर मोजलेली नाही — पूर्ण चित्रासाठी ती खरेदी नोंदवा.",
  ],
  "loyalty.example": [
    "A ₹500 bill earns {points} points, worth {value} the next time they redeem.",
    "₹500 के बिल पर {points} पॉइंट मिलेंगे, जो अगली बार {value} के बराबर होंगे।",
    "₹500 च्या बिलावर {points} पॉइंट मिळतील, जे पुढच्या वेळी {value} इतके असतील.",
  ],

  "festival.daysAway": ["{days}d away", "{days} दिन बाकी", "{days} दिवस बाकी"],

  // Date range chips
  "range.today": ["Today", "आज", "आज"],
  "range.last7": ["Last 7 days", "पिछले 7 दिन", "मागील 7 दिवस"],
  "range.last30": ["Last 30 days", "पिछले 30 दिन", "मागील 30 दिवस"],
  "range.custom": ["Custom range", "अपनी तारीखें", "निवडक तारखा"],
  "range.from": ["From", "से", "पासून"],
  "range.to": ["To", "तक", "पर्यंत"],
  "range.apply": ["Apply", "लागू करें", "लागू करा"],

  // All bills
  "bills.title": ["All bills", "सभी बिल", "सर्व बिले"],
  "bills.subtitle": ["Browse and reprint any past bill", "पुराने बिल देखें और दोबारा प्रिंट करें", "जुनी बिले पहा आणि पुन्हा प्रिंट करा"],
  "bills.searchCustomer": ["Search by customer name", "ग्राहक के नाम से खोजें", "ग्राहकाच्या नावाने शोधा"],
  "bills.count": ["Bills", "बिल", "बिले"],
  "bills.total": ["Total", "कुल", "एकूण"],
  "bills.onUdhaar": ["On udhaar", "उधार पर", "उधारीवर"],
  "bills.emptyTitle": ["No bills here", "यहाँ कोई बिल नहीं", "येथे एकही बिल नाही"],
  "bills.emptyText": [
    "Nothing was billed in this range. Try Last 7 days or Last 30 days.",
    "इस अवधि में कोई बिल नहीं बना। पिछले 7 या 30 दिन देखें।",
    "या कालावधीत एकही बिल झाले नाही. मागील 7 किंवा 30 दिवस पहा.",
  ],

  // Bill page
  "billPage.paperSize": ["Paper size", "कागज़ का साइज़", "कागदाचा आकार"],
  "billPage.print": ["Print", "प्रिंट", "प्रिंट"],
  "billPage.printing": ["Printing…", "प्रिंट हो रहा है…", "प्रिंट होत आहे…"],
  "billPage.printed": ["Printed ✓", "प्रिंट हो गया ✓", "प्रिंट झाले ✓"],
  "billPage.savePdf": ["Save PDF", "PDF सेव करें", "PDF सेव्ह करा"],
  "billPage.preparing": ["Preparing…", "तैयार हो रहा है…", "तयार होत आहे…"],
  "billPage.kioskHint": ["Print without the dialog? Set it up", "बिना डायलॉग के प्रिंट करना है? सेट अप करें", "डायलॉगशिवाय प्रिंट करायचे? सेट अप करा"],
  "billPage.firstPrintHint": [
    "The first print asks you to pick the printer once — after that, printing is one tap.",
    "पहली बार एक बार प्रिंटर चुनना होगा — उसके बाद एक टैप में प्रिंट।",
    "पहिल्यांदा एकदा प्रिंटर निवडावा लागेल — नंतर एका टॅपमध्ये प्रिंट.",
  ],
  "print.cancelled": ["Printer selection was cancelled.", "प्रिंटर चुनना रद्द हुआ।", "प्रिंटर निवड रद्द झाली."],
  "billPage.changePrinter": ["Change printer", "प्रिंटर बदलें", "प्रिंटर बदला"],

  // Customers
  "customers.emptyTitle": ["No customers yet", "अभी कोई ग्राहक नहीं", "अजून एकही ग्राहक नाही"],
  "customers.emptyText": [
    "Add your regular customers to keep their udhaar and send WhatsApp reminders.",
    "अपने नियमित ग्राहक जोड़ें — उनका उधार रखें और WhatsApp पर याद दिलाएं।",
    "आपले नेहमीचे ग्राहक जोडा — त्यांची उधारी ठेवा आणि WhatsApp वर आठवण करून द्या.",
  ],
  "customers.add": ["+ Add customer", "+ ग्राहक जोड़ें", "+ ग्राहक जोडा"],
  "customers.noMatch": [
    "No one matches \"{q}\". Check the spelling or search by phone.",
    "\"{q}\" से कोई ग्राहक नहीं मिला। स्पेलिंग जाँचें या फ़ोन नंबर से खोजें।",
    "\"{q}\" शी जुळणारा ग्राहक नाही. स्पेलिंग तपासा किंवा फोन नंबरने शोधा.",
  ],

  // Customer khata
  "ledger.toCollect": ["To collect", "लेना बाकी", "येणे बाकी"],
  "ledger.balance": ["Balance", "बैलेंस", "शिल्लक"],
  "ledger.settled": ["Settled ✓", "हिसाब साफ़ ✓", "हिशोब पूर्ण ✓"],
  "ledger.totalBusiness": ["Total business", "कुल बिक्री", "एकूण व्यवसाय"],
  "ledger.totalPaid": ["Total paid", "कुल जमा", "एकूण जमा"],
  "ledger.paymentReceived": ["+ Payment received", "+ पैसे मिले", "+ पैसे मिळाले"],
  "ledger.paymentReceivedTitle": ["Payment received", "पैसे मिले", "पैसे मिळाले"],
  "ledger.amountReceived": ["Amount received (₹)", "मिली रकम (₹)", "मिळालेली रक्कम (₹)"],
  "ledger.noteOptional": ["Note (optional)", "नोट (वैकल्पिक)", "नोंद (ऐच्छिक)"],
  "ledger.notePlaceholder": ["e.g. Paid in cash", "जैसे: नकद दिए", "उदा. रोख दिले"],
  "ledger.remind": ["Remind", "याद दिलाएं", "आठवण करा"],
  "ledger.viewKhata": ["View khata", "खाता देखें", "खाते पहा"],
  "ledger.shareKhata": ["Share khata", "खाता भेजें", "खाते पाठवा"],
  "ledger.statementPdf": ["Statement PDF", "स्टेटमेंट PDF", "स्टेटमेंट PDF"],
  "ledger.warrantyCard": ["Warranty card", "वारंटी कार्ड", "वॉरंटी कार्ड"],
  "ledger.shareWarranty": ["Share warranty", "वारंटी भेजें", "वॉरंटी पाठवा"],
  "ledger.history": ["History", "इतिहास", "इतिहास"],
  "ledger.empty": ["Their bills and payments will show up here.", "इनके बिल और भुगतान यहाँ दिखेंगे।", "यांची बिले आणि पेमेंट येथे दिसतील."],
  "ledger.paidBy": ["{amount} paid by {method}", "{amount} {method} से जमा", "{amount} {method} ने जमा"],

  // Purchases & suppliers
  "purchases.emptyTitle": ["No purchases yet", "अभी कोई खरीद नहीं", "अजून एकही खरेदी नाही"],
  "purchases.emptyText": [
    "Log what you buy from suppliers to track stock, cost and GST input credit.",
    "सप्लायर से खरीदा माल दर्ज करें — स्टॉक, लागत और GST इनपुट क्रेडिट का हिसाब रहेगा।",
    "पुरवठादाराकडून घेतलेला माल नोंदवा — स्टॉक, खर्च आणि GST इनपुट क्रेडिटचा हिशोब राहील.",
  ],
  "purchases.add": ["+ Add purchase", "+ खरीद जोड़ें", "+ खरेदी जोडा"],
  "purchases.noPayments": [
    "No supplier payments yet — they appear here once you record one.",
    "अभी सप्लायर को कोई भुगतान नहीं — दर्ज करते ही यहाँ दिखेगा।",
    "अजून पुरवठादाराला कोणतेही पेमेंट नाही — नोंदवताच येथे दिसेल.",
  ],
  "vendors.emptyTitle": ["No suppliers yet", "अभी कोई सप्लायर नहीं", "अजून एकही पुरवठादार नाही"],
  "vendors.emptyText": [
    "Add the wholesalers you buy from to log purchases and track what you owe them.",
    "जिनसे आप माल खरीदते हैं उन्हें जोड़ें — खरीद दर्ज करें और उनका बकाया देखें।",
    "ज्यांच्याकडून माल घेता ते जोडा — खरेदी नोंदवा आणि त्यांचे देणे पहा.",
  ],
};
