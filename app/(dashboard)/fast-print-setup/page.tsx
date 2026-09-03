import { PageHeader } from "@/app/components/PageHeader";
import { Printer } from "lucide-react";

export default function FastPrintSetupPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={<Printer size={18} strokeWidth={1.8} />} title="One-Click Print Setup" subtitle="Laptop/desktop se bina dialog ke seedha print — ek baar setup karein" />

      <div className="neu-card flex flex-col gap-2 p-4">
        <p className="text-sm text-foreground">
          Ye <strong>genuinely wahi tarika hai jo bade POS/billing systems (jaise restaurant billing machines) use karte hain</strong> silent,
          one-click printing ke liye. Isme Chrome/Edge ko ek special &quot;kiosk-printing&quot; mode mein khola jaata hai — uske baad{" "}
          <strong>Print button dabate hi, koi dialog dikhaye bina, seedha aapke default printer par print ho jaata hai.</strong>
        </p>
        <p className="text-xs text-muted">Ek baar shortcut bana lene ke baad, ye hamesha ke liye kaam karta hai — roz karne ki zaroorat nahi.</p>
      </div>

      <div className="neu-card flex flex-col gap-3 p-4">
        <p className="text-sm font-semibold text-foreground">🪟 Windows par setup (5 minute, ek baar)</p>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-foreground">
          <li>Desktop par right-click karein → <strong>New → Shortcut</strong></li>
          <li>
            Ye poora likhein (Chrome ke liye) — apni site ka URL end mein daal dein:
            <code className="mt-1 block overflow-x-auto whitespace-pre rounded-lg bg-surface p-2.5 text-xs">
              &quot;C:\Program Files\Google\Chrome\Application\chrome.exe&quot; --kiosk-printing --app=https://bill.theray.in
            </code>
          </li>
          <li>Shortcut ka naam dein — jaise <strong>&quot;The Ray — Fast Print&quot;</strong></li>
          <li>Roz isी shortcut se app kholein (normal Chrome tab se nahi) — is shortcut mein hi silent-print ka jaadu hai</li>
        </ol>
      </div>

      <div className="neu-card flex flex-col gap-3 p-4">
        <p className="text-sm font-semibold text-foreground">🍎 Mac par setup</p>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-foreground">
          <li>Terminal kholein (Spotlight se &quot;Terminal&quot; search karein)</li>
          <li>
            Ye command likh kar Enter dabaएं:
            <code className="mt-1 block overflow-x-auto whitespace-pre rounded-lg bg-surface p-2.5 text-xs">
              open -a &quot;Google Chrome&quot; --args --kiosk-printing --app=https://bill.theray.in
            </code>
          </li>
          <li>
            Roz isko dobara chalane ke liye, ek <strong>.command file</strong> bana kar Desktop par rakh sakते hain (upar wali command usme paste kar ke) — double-click se hi khul jaएga
          </li>
        </ol>
      </div>

      <div className="neu-card flex flex-col gap-2 p-4">
        <p className="text-sm font-semibold text-foreground">⚠️ Zaroori baatein</p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-xs text-muted">
          <li>Aapka thermal/regular printer <strong>Windows/Mac mein default printer</strong> set hona chahiye (Settings → Printers)</li>
          <li>Ye sirf <strong>is specific shortcut se khole gए Chrome window</strong> mein kaam karta hai — normal Chrome tab mein dialog waisa hi rahega</li>
          <li>Agar shortcut se app khulne ke baad login maangे, ek baar login kar lein — session save ho jaएga</li>
          <li>Mobile/Android par ye kaam nahi karta (ye sirf Windows/Mac laptop ke liye hai) — mobile ke liye <strong>Bluetooth print</strong> use karें (jo pehli baar pairing ke baad already 1-click hai)</li>
        </ul>
      </div>
    </div>
  );
}
