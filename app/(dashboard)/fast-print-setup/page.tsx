import { PageHeader } from "@/app/components/PageHeader";
import { Download, Printer } from "lucide-react";
import { AutoPrintToggle } from "./AutoPrintToggle";
import { PrintHelperSetup } from "./PrintHelperSetup";
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
        <PrintHelperSetup />
      </div>

      <div className="neu-card flex flex-col gap-3 p-4">
        <p className="text-sm font-semibold text-foreground">🪟 Or, without installing anything: the Fast Print shortcut</p>
        <a href="/fast-print" download className="btn-primary flex items-center justify-center gap-2">
          <Download size={16} /> Download one-click print setup
        </a>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-foreground">
          <li>
            Open the downloaded file <strong>TheRay-FastPrint-Setup.cmd</strong>. If Chrome asks, choose <strong>Keep</strong>; if Windows shows
            &quot;Windows protected your PC&quot;, tap <strong>More info → Run anyway</strong>.
          </li>
          <li>
            It puts a <strong>&quot;The Ray - Fast Print&quot;</strong> shortcut on your desktop and opens The Ray from it. Log in there once.
          </li>
          <li>Make your thermal printer the <strong>default printer</strong> in Windows (Settings → Printers).</li>
          <li>Every day, open The Ray from this shortcut. Print then goes straight to the printer.</li>
        </ol>
        <p className="text-xs text-muted">
          The shortcut opens a separate window of its own, so it skips the dialog even when Chrome is already open for other work.
        </p>
      </div>

      <div className="neu-card flex flex-col gap-2 p-4">
        <AutoPrintToggle />
        <p className="text-xs text-muted">
          Works with the Print Helper or the Fast Print shortcut. With the shortcut, turn it on inside the Fast Print window (open this page
          there): each window remembers it separately.
        </p>
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
          <li>The bill prints in the size it was last printed at — for a thermal bill, open it in Thermal 80mm or 58mm view</li>
          <li>Only the window opened from <strong>this shortcut</strong> skips the dialog — normal Chrome tabs still show it</li>
          <li>If the shortcut asks you to log in, log in once; the session is remembered</li>
          <li>This is for Windows/Mac only. On phones, use <strong>Bluetooth print</strong> — after the first pairing it is already one tap</li>
        </ul>
      </div>
    </div>
  );
}
