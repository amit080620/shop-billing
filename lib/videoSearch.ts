import { TRAINING_VIDEOS, videosFor, type TrainingVideo } from "./trainingVideos";

/** Hinglish words people actually type when stuck, mapped onto the English words used in the
 * video topic titles. */
const SAME_AS: Record<string, string[]> = {
  udhaar: ["udhaar", "khata"], udhar: ["udhaar", "khata"], udhari: ["udhaar", "khata"], baki: ["udhaar"], baaki: ["udhaar"], credit: ["udhaar"], khata: ["khata"],
  chhap: ["print"], printer: ["print"], printing: ["print"], thermal: ["thermal", "print"],
  gst: ["gst", "gstr"], tax: ["gst"], gstr: ["gstr"], hsn: ["hsn", "gst"],
  maal: ["stock"], saman: ["stock"], samaan: ["stock"], inventory: ["stock"],
  scanner: ["scan", "barcode"],
  kharid: ["purchase"], khareed: ["purchase"], kharidi: ["purchase"], supplier: ["vendor", "purchase"], distributor: ["vendor", "distributor"],
  wapas: ["return"], vapas: ["return"], wapsi: ["return"],
  employee: ["staff"], karmchari: ["staff"], naukar: ["staff"], tankhwah: ["salary"], tankha: ["salary"], pagar: ["salary"],
  hisab: ["report"], hisaab: ["report"],
  chhoot: ["discount"], chhut: ["discount"],
  parchi: ["bill"], invoice: ["invoice", "bill"],
  paisa: ["payment"], paise: ["payment"], upi: ["payment"],
  bhasha: ["language"], hindi: ["language"], marathi: ["language"],
  subscription: ["plan"], renew: ["plan"], recharge: ["plan"],
  estimate: ["estimate", "quotation"],
  grahak: ["customer"], customers: ["customer"],
  daam: ["price", "rate"], keemat: ["price", "rate"], kimat: ["price", "rate"], bhav: ["rate", "price"],
  galla: ["cash"],
  galat: ["void"], cancel: ["void"], delete: ["void"],
  internet: ["offline"], net: ["offline"],
  kot: ["kot", "kitchen"], rasoi: ["kitchen"],
  booking: ["booking", "appointment"], appointment: ["appointment", "booking"],
  dawai: ["medicines"], dawa: ["medicines"], medicine: ["medicines"],
  sona: ["gold"], chandi: ["silver"],
  gaadi: ["vehicle"], gadi: ["vehicle"], truck: ["vehicle", "bilty"],
  kiraya: ["rental", "freight"],
  password: ["staff", "logins"], login: ["logins"],
};

const SKIP = new Set("the and for not nahi nhi hai hain kaise kese kesay kaisay kya kyu kyon mera mere meri raha rahi rahe karna karte karo kar hua huwa app how what why when does with this that are was can our aur bhi koi kuch ek par per mai main mein may pe se ka ki ke ko ho hota hoti please plz sir ji abhi".split(" "));

function words(text: string): string[] {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length >= 3 && !SKIP.has(w));
}

const ENDINGS = new Set(["", "s", "es", "ed", "er", "ers", "ing", "ings"]);
/** The same word give or take an ending (bill/billing, print/printer) — but plan is not planner. */
const same = (a: string, b: string) => {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return long.startsWith(short) && ENDINGS.has(long.slice(short.length));
};

export type VideoHit = { video: TrainingVideo; t: number; topic: string };

/** The videos (and the second inside each) that answer what someone typed — this shop's own
 * trade first, then the ones for every shop. Words found in fewer topics count for more. */
export function findVideos(text: string, businessType: string, limit = 3): VideoHit[] {
  // One group per typed word: "udhaar" counts once even though it also means "khata".
  const groups = [...new Map(words(text).map((w) => [w, SAME_AS[w] ?? [w]])).values()];
  if (!groups.length) return [];
  const { own, common } = videosFor(businessType);
  const pool = [...own, ...common];
  const allTopics = TRAINING_VIDEOS.flatMap((v) => v.topics.map(([, title]) => words(title)));
  const weight = new Map(groups.flat().map((w) => [w, Math.log(1 + allTopics.length / Math.max(1, allTopics.filter((tw) => tw.some((x) => same(x, w))).length))]));
  const hits: (VideoHit & { score: number })[] = [];
  pool.forEach((video, rank) => {
    let best: (VideoHit & { score: number }) | null = null;
    for (const [t, topic] of video.topics) {
      const tw = words(topic);
      const score = groups.reduce((s, g) => s + Math.max(0, ...g.filter((w) => tw.some((x) => same(x, w))).map((w) => weight.get(w) ?? 0)), 0);
      if (score > 0 && (!best || score > best.score)) best = { video, t, topic, score: score - rank * 0.001 };
    }
    if (best) hits.push(best);
  });
  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ video, t, topic }) => ({ video, t, topic }));
}
