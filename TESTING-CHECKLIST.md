# पूरे App की Testing Checklist

हर business type और हर बड़े feature के लिए — क्रम से टिक करते जाइए। जो भी काम न करे या अजीब लगे, बस उसका नाम और कदम मुझे बता दीजिए, मैं तुरंत ठीक करूँगा।

**कैसे इस्तेमाल करें:** पहले अपनी असली shop के जिस business type पर काम शुरू करना है, उसका section खोलें। "🔁 सभी के लिए साझा" section हर business type पर लागू होता है, उसे भी करें।

---

## 🔁 सभी Business Types के लिए साझा (सबसे पहले यह करें)

- [ ] Signup करके नई shop बनाएँ (या पुराने account से Login करें) — password field में 👁️ आइकन दिखे, टैप करने पर password दिखे/छुपे
- [ ] More → GST & Shop Profile — State चुनें, बिना यह भरे बिल नहीं बनना चाहिए
- [ ] More → Invoice design — Tagline, Footer, Terms, Bank details भरें, कोई एक Accent Colour चुनें, Save करें
- [ ] एक नया Product/Item जोड़ें — Name, Price, GST%, Unit
- [ ] उसी item पर 📷 टैप करके फ़ोटो अपलोड करें
- [ ] उसी item में Offer price + Offer label सेट करें
- [ ] एक नया Customer जोड़ें (नाम + फ़ोन)
- [ ] एक Bill बनाएँ — item जोड़ें, customer attach करें, Save करें
- [ ] उस Bill का Print/PDF देखें — Tagline, Footer, Accent Colour सही दिख रहे हैं या नहीं
- [ ] उसी Bill पर **"Send invoice on WhatsApp"** — भाषा जो भी set है, message उसी भाषा में सही जाए
- [ ] More → Language बदलकर Hindi/Marathi करें — पूरा app उसी भाषा में दिखे
- [ ] Reminders पेज खोलें, किसी customer को उधार-याद-दिलाने वाला WhatsApp भेजें — सही भाषा में जाए
- [ ] Reports → Daily Summary खोलें — आज की बिक्री सही दिखे
- [ ] Reports → GSTR-1 / GSTR-3B खोलें — कोई error न आए
- [ ] Customers पेज → **"📤 Bulk import / export"** — Template download करें, उसी में एक row भरकर वापस import करें
- [ ] More → "Catalog link" — Enable करें, link copy करें, उसे **logout करके/incognito में** खोलें — item फ़ोटो, price, offer दिखें
- [ ] उस incognito browser से एक item cart में डालकर order भेजें
- [ ] वापस अपने account से More → "Catalog orders" खोलें — वो order Pending में दिखे, "Accept & bill" दबाकर असली बिल बने
- [ ] More → "Install app on this device" बटन दिखे और टैप करने पर install prompt आए
- [ ] Staff जोड़ें (More → Staff), उसका PIN/password सेट करें, उसी से अलग browser/incognito में login करके देखें कि सिर्फ़ ज़रूरी चीज़ें दिखें
- [ ] More → Manager PIN सेट करें, फिर Returns में कोई return प्रोसेस करते वक़्त वो PIN माँगे या नहीं

---

## 🛒 Grocery / Kirana

- [ ] Product में MRP भरें — Bill पर MRP कटा हुआ (struck-through) और "आपने कितना बचाया" दिखे
- [ ] Bulk pricing सेट करें (जैसे 10+ पर ₹45) — New Bill में quantity 10+ करते ही अपने-आप rate बदले, "📦 Bulk price applied" दिखे
- [ ] Barcode scan करके item जोड़ें (camera या hardware scanner)
- [ ] Low stock वाला item देखें — Dashboard/Alerts पर दिखे
- [ ] Expiry date वाला batch जोड़ें (अगर track कर रहे हैं) — Expiry alerts पेज पर दिखे

## 🏪 Mart / Supermarket

- [ ] Grocery वाले सारे टेस्ट यहाँ भी दोहराएँ (MRP, Bulk pricing, Barcode)
- [ ] Category बनाकर products उसमें डालें — Products पेज पर category से filter करें

## 🔧 Hardware / Electrical

- [ ] Product में Warranty months सेट करें — Bill पर warranty expiry date दिखे
- [ ] More → Warranty lookup — फ़ोन नंबर या invoice number से खोजें, सही item दिखे
- [ ] Bulk pricing टेस्ट करें (ऊपर Grocery जैसा)

## 💊 Pharmacy / Medical

- [ ] नया Medicine जोड़ते वक़्त नाम टाइप करना शुरू करें — नीचे common medicine names का सुझाव आए
- [ ] Batch नंबर + Expiry date के साथ stock जोड़ें
- [ ] Prescription-required दवा को बिल में डालें — prescription details माँगे
- [ ] Expiry के करीब वाला batch — Expiry Alerts पेज पर दिखे
- [ ] एक Batch को Write-off करें — स्टॉक सही घटे

## 🍽️ Restaurant / Café

- [ ] नया Table बनाएँ, QR code देखें
- [ ] उस Table का Order शुरू करें, items जोड़ें, Kitchen Display (KDS) पर दिखें
- [ ] QR code को incognito में scan करके customer-side से order भेजें — staff की तरफ़ "pending request" दिखे, Accept करें
- [ ] Order Settle करें — बिल बने, table खाली हो जाए
- [ ] Combo item बनाकर बिल में जोड़ें
- [ ] **Reservations** — More → Reservations से एक booking करें, WhatsApp confirm भेजें, "Seated" mark करें
- [ ] Day-wise और Item-wise Reports देखें

## 🔁 Rental Business

- [ ] Item को Rentable mark करें, hourly/daily rate सेट करें
- [ ] एक नई Rental booking बनाएँ (start date, end date, deposit)
- [ ] **Availability Calendar** (Rentals → 📅) खोलकर देखें booked दिन सही रंग में दिखें (🟡/🔴)
- [ ] Rental को Return करें — देर होने पर late fee, नुकसान पर damage charge सही जुड़े
- [ ] Rental History देखें

## 🚚 Transport & Materials

- [ ] नई Vehicle जोड़ें, rate per km सेट करें
- [ ] Vehicle में RC/Insurance/PUC/Fitness की expiry date भरें
- [ ] 30 दिन के अंदर की date भरकर देखें — Vehicles page और Home dashboard दोनों पर ⚠️ warning दिखे
- [ ] Bill में Transport charge जोड़ें (vehicle चुनकर, km भरकर)
- [ ] Transport Reports देखें

## 🛠️ Repair & Services

- [ ] नया Job बनाएँ — एक साथ कई items जोड़ें ("+ Add another item")
- [ ] Job Detail खोलें — itemized list सही दिखे
- [ ] Technician assign करें, status बदलें (Received → In Progress → Ready)
- [ ] "Ready" होने पर WhatsApp notify भेजें — सही भाषा में जाए
- [ ] Deliver & Bill करें — असली बिल बने

## 💇 Salon / Spa

- [ ] Bill में Stylist नाम डालें — Staff commission report में दिखे
- [ ] **Appointments** — नई appointment book करें, WhatsApp confirm भेजें
- [ ] More → "Online booking" — working hours सेट करें, link enable करें, उस link को incognito में खोलकर खुद appointment book करें
- [ ] वापस अपने account में वो booking दिखे

## 💍 Jewellery

- [ ] More → "Today's rate" — Gold/Silver rate भरें
- [ ] नए Bill में **"💍 Add jewellery item by weight"** — weight, purity, making charge भरें, सही amount निकले
- [ ] Item में Hallmark/HUID number भरें — बिल पर दिखे
- [ ] **Old gold exchange** — New Bill में "♻️ Customer exchanging old gold?" से exchange करें, payment में सही adjust हो
- [ ] More → "Exchange history" — वो exchange वहाँ दिखे

## 🩺 Clinic / Doctor

- [ ] More → Clinic → "Prescription pad settings" — Header (नाम/डिग्री/reg no.), Footer, Custom fields (Chief Complaint वगैरह) भरें
- [ ] Bottom tab → **Appointments** — नई appointment book करें
- [ ] Bottom tab → **New Rx** — Patient जानकारी भरें, medicine टाइप करते ही सुझाव आएँ, कई medicines जोड़ें
- [ ] Prescription Print देखें — Letterhead, custom fields, दवाओं की list सही दिखे
- [ ] Print पेज पर **"Generate bill"** दबाएँ — असली invoice बने
- [ ] More → Clinic → "Online booking" — patient खुद appointment book करे (incognito से टेस्ट करें)
- [ ] Customers पेज पर Bulk Import — DOB/Gender/Blood Group/Allergies के साथ patient import करें

---

## जो भी गड़बड़ मिले, ऐसे बताएँ

बताते वक़्त सिर्फ़ यह लिख दें:
1. **किस business type** में
2. **कौन सा कदम** करते वक़्त
3. **क्या उम्मीद थी, क्या हुआ** (screenshot हो तो और भी अच्छा)

इससे मैं बिना पूछे सीधा उसी जगह जाकर ठीक कर सकूँगा।
