import { PageHeader } from "@/app/components/PageHeader";
import { Printer } from "lucide-react";
import { BackLink } from "@/app/components/BackLink";

export default function FastPrintSetupPage() {
  return (
    <div className="flex flex-col gap-4">
      <BackLink fallback="/dashboard" />
      <PageHeader icon={<Printer size={18} strokeWidth={1.8} />} title="One-click printing" subtitle="Print from a laptop or desktop without the print dialog. Set it up once." />

      <div className="neu-card flex flex-col gap-2 p-4">
        <p className="text-sm text-foreground">
          This is how counter billing systems print: Chrome or Edge opens in &quot;kiosk printing&quot; mode, and from then on{" "}
          <strong>the Print button sends the bill straight to your default printer, with no dialog.</strong>
        </p>
        <p className="text-xs text-muted">You create the shortcut once; it keeps working every day.</p>
      </div>

      <div className="neu-card flex flex-col gap-3 p-4">
        <p className="text-sm font-semibold text-foreground">🪟 Windows (5 minutes, once)</p>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-foreground">
          <li>Right-click the desktop → <strong>New → Shortcut</strong></li>
          <li>
            Paste this as the location (for Chrome):
            <code className="mt-1 block overflow-x-auto whitespace-pre rounded-lg bg-surface p-2.5 text-xs">
              &quot;C:\Program Files\Google\Chrome\Application\chrome.exe&quot; --kiosk-printing --app=https://bill.theray.in
            </code>
          </li>
          <li>Name it, for example <strong>&quot;The Ray — Fast Print&quot;</strong></li>
          <li>Open the app from this shortcut every day, not from a normal Chrome tab — the shortcut is what skips the dialog</li>
        </ol>
      </div>

      <div className="neu-card flex flex-col gap-3 p-4">
        <p className="text-sm font-semibold text-foreground">🍎 Mac</p>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-foreground">
          <li>Open Terminal (search &quot;Terminal&quot; in Spotlight)</li>
          <li>
            Type this command and press Enter:
            <code className="mt-1 block overflow-x-auto whitespace-pre rounded-lg bg-surface p-2.5 text-xs">
              open -a &quot;Google Chrome&quot; --args --kiosk-printing --app=https://bill.theray.in
            </code>
          </li>
          <li>
            To reuse it daily, paste the command into a <strong>.command file</strong> on the desktop and double-click it
          </li>
        </ol>
      </div>

      <div className="neu-card flex flex-col gap-2 p-4">
        <p className="text-sm font-semibold text-foreground">⚠️ Good to know</p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-xs text-muted">
          <li>Set your thermal or regular printer as the <strong>default printer</strong> in Windows/Mac settings</li>
          <li>Only the window opened from <strong>this shortcut</strong> skips the dialog — normal Chrome tabs still show it</li>
          <li>If the shortcut asks you to log in, log in once; the session is remembered</li>
          <li>This is for Windows/Mac only. On phones, use <strong>Bluetooth print</strong> — after the first pairing it is already one tap</li>
        </ul>
      </div>
    </div>
  );
}
