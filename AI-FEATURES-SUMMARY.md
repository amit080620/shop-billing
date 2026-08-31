# The Ray — AI Features Summary (Client Pitch)

## 🌙 Sabse pehle: "Raat ko AI kaam karta hai" wala pipeline

Har raat **11:30 PM** par, bina kisi ke app khole, system khud-ba-khud chalता hai aur:
- Har customer ka **udhar check karta hai** (14+ din se pending kaun hai)
- **Stock check karta hai** (kya khatam hone wala hai)
- Staff ka activity check karta hai (koi unusual voids/discount to nahi)
- Sab kuch ek **plain-language summary** mein taiyaar kar deta hai

**Subah jab app khulti hai** — ye summary **turant (0.5 second mein)** dikhती hai, bina wait kiye. Bilkul jaise koi employee raat ko kaam kar ke subah report de raha ho.

**Client ko kaise bolein:** *"Aapka app raat ko so-ta nahi — wo kaam karta hai."*

---

## 🤖 Sab AI Features — poori list

### 1. Photo se Product/Bill Scan (Gemini AI)
| Kya karta hai | Kahan |
|---|---|
| Kisi bhi price-list/menu/rate-card ki photo ya PDF se — items+price automatically nikaal deta hai | Products → Scan price list |
| Vendor ke bill ki photo/PDF se — items+quantity+rate automatically bill mein bhar deta hai | Purchase → Scan vendor bill |
| Multi-page PDF bhi padh leta hai, ek saath multiple photos bhi le sakte hain | Dono jagah |
| Camera **ya** Gallery (WhatsApp se aayi photo) — dono se scan kar sakte hain | Dono jagah |

**Client pitch:** *"200 products haath se type karne ki jagah, photo khींchiye aur AI khud bhar dega."*

### 2. "Correction Memory" — AI aapse seekhता hai
Agar AI koi naam galat padhe aur aap use theek karein, **agli baar wahi galti apne aap sudhar jaayegi**. Time ke saath app aapke specific shop ke liye smart hoती jaati hai.

### 3. Voice Billing — bol kar bill banao
"2 samosa, 1 chai" boliye — items automatically cart mein add ho jaate hain, sahi quantity ke saath. Hindi number words bhi samajhta hai (do, teen, char...).
- Fast Billing mein
- Regular Sell page mein bhi

### 4. AI Shop Assistant — poochho kuch bhi
Ek chat, jo aapke **real data** se jawab deta hai (koi guess nahi):
- "Aaj kitna business hua?"
- "Ramesh ka udhar kitna hai?"
- "Udhar wale customers jo 60 din se nahi aaye" (compound sawaal)
- "Kitne customers hain mere paas?"
- "Mera total stock value kitna hai?"
- "Is mahine GST kitna banta hai?"
- "Kisi staff ka activity check karo"

**Action bhi leta hai:** "Ramesh ko udhar reminder bhejo" bolते hi, ek ready-made WhatsApp message + button aa jaata hai — sirf "Send" dabana hai.

### 5. Predictive Reorder — "kab khatam hoga" bataता hai
Sirf "stock kam hai" nahi — **"Rice roz 2.3kg bikता hai, 3 din mein khatam ho jaayega"** — sales-pattern se predict karta hai, crisis se pehle hi pata chal jaata hai.

### 6. Customer-facing AI Khata — customer khud pooch sakta hai
Aapka Khata-book link customer ko bhejte hain — usme ab ek **"Poochho apna hisaab"** button hai. Customer khud AI se pooch sakta hai apne udhar/history ke baare mein — **bina aapko disturb kiye**. Voice se bhi poochh sakta hai.

### 7. Purana Khata → Digital (photo se migrate)
Purana pen-paper khata register ke photos khींचिए — AI **customer names + unka udhar-balance** poora padh kar digital khata bana deta hai. Saalon ki history minutes mein migrate.

**Client pitch:** *"Purana record kho jaayega ye darr khatam — sirf photo khींचिए।"*

### 8. Festival Poster Generator
Occasion likhiye ("Diwali sale"), AI turant offer-text likhता hai, ek professional poster ban jaata hai — download ya seedha WhatsApp Status par share.

### 9. Staff Fraud/Anomaly Detection
Agar koi staff-member normal se zyada bills void kare ya zyada discount de, AI raat ko khud check kar ke bata deta hai.

### 10. Cross-Shop Customer Trust Network
Agar koi customer multiple Ray-shops mein jaata hai, ek shop dekh sakti hai "ye customer 3 shops mein reliably udhar chukata hai" — **bina paisa/detail share kiye**, sirf trust-signal.

---

## 💰 Sabse zaroori baat — **cost**

**Sab kuch upar wala — 100% FREE hai** (Google Gemini + Groq/Meta LLaMA ke free tier se). Na aap ko, na aapke client ko koi AI-usage bill kabhi aayega, jab tak business genuinely bahut bada scale (sainkड़ों shops) na ho jaaye.

---

## ✅ Testing Status

| Feature | Status |
|---|---|
| Scan (Product/Purchase) | ✅ Working, tested |
| Voice Billing | ✅ Working, tested |
| AI Assistant chat | ✅ Working, tested |
| Overnight briefing | ✅ Built — pehla real-run aane wala hai (24 ghante lagenge confirm karne mein) |
| Predictive Reorder | ✅ Built, ready to test |
| Customer AI Khata | ✅ Built, ready to test |
| Khata Migration | ✅ Built, ready to test |
| Festival Poster | ✅ Working, tested |
| Staff Detection | ✅ Built, ready to test |
| Cross-shop Network | ✅ Foundation built (value tab tak dikhegi jab multiple shops use karें) |
