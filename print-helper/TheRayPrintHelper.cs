// The Ray Print Helper — lets bill.theray.in print a bill straight to a Windows printer in one click,
// with no print dialog, the way installed billing software does.
//
// It runs in the system tray and listens on 127.0.0.1 only (never the network). The web app sends it
// the bill as ESC/POS bytes, which go to the printer RAW, so the printer prints in its own crisp
// built-in font. Only The Ray's own sites may use it.
//
// One file, built with the C# compiler that ships with Windows' .NET Framework 4:
//   print-helper\build.cmd
// First run copies itself to %LOCALAPPDATA%\TheRayPrintHelper, starts with Windows, and stays in the tray.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("The Ray Print Helper")]
[assembly: AssemblyProduct("The Ray Print Helper")]
[assembly: AssemblyCompany("The Ray")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

static class Program
{
    public const string Version = "1.0.0";
    public const int Port = 41777;
    const string AppName = "TheRayPrintHelper";
    const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";

    // Sites allowed to print. Anything else gets 403, so no other website can use the printer.
    static readonly string[] AllowedOrigins = { "https://bill.theray.in", "https://www.theray.in", "https://theray.in", "http://localhost:3000" };

    static NotifyIcon tray;

    [STAThread]
    static void Main(string[] args)
    {
        string installDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), AppName);
        string installedExe = Path.Combine(installDir, AppName + ".exe");
        string me = Assembly.GetExecutingAssembly().Location;

        // --portable: just run from here, installing nothing (for trying it out, or a shop that starts it by hand).
        bool portable = Array.IndexOf(args, "--portable") >= 0;
        if (portable) installedExe = me;

        // Run from the downloaded file: install (or update) the copy, set it to start with Windows, start it.
        if (!portable && !string.Equals(Path.GetFullPath(me), Path.GetFullPath(installedExe), StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                StopRunningCopy();
                Directory.CreateDirectory(installDir);
                File.Copy(me, installedExe, true);
                SetStartWithWindows(installedExe, true);
                Process.Start(installedExe, "--installed");
            }
            catch (Exception e)
            {
                MessageBox.Show("Could not install The Ray Print Helper:\n" + e.Message, "The Ray Print Helper", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            return;
        }

        bool firstInstance;
        using (var mutex = new Mutex(true, @"Local\" + AppName, out firstInstance))
        {
            if (!firstInstance) return;

            Application.EnableVisualStyles();
            var listener = new Thread(Listen) { IsBackground = true };
            listener.Start();

            var menu = new ContextMenuStrip();
            menu.Items.Add(new ToolStripMenuItem("The Ray Print Helper " + Version + " — running") { Enabled = false });
            menu.Items.Add("Print a test slip", null, (s, e) => TestSlip());
            var startup = new ToolStripMenuItem("Start with Windows") { Checked = StartsWithWindows(), CheckOnClick = true };
            startup.CheckedChanged += (s, e) => SetStartWithWindows(installedExe, startup.Checked);
            if (!portable) menu.Items.Add(startup);
            menu.Items.Add("Open The Ray", null, (s, e) => Process.Start("https://bill.theray.in"));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Exit", null, (s, e) => { tray.Visible = false; Application.Exit(); });

            tray = new NotifyIcon
            {
                Icon = Icon.ExtractAssociatedIcon(installedExe) ?? SystemIcons.Application,
                Text = "The Ray Print Helper — ready",
                ContextMenuStrip = menu,
                Visible = true,
            };
            if (Array.IndexOf(args, "--installed") >= 0)
                tray.ShowBalloonTip(6000, "The Ray Print Helper is ready", "Bills from The Ray now print in one click. It starts with Windows by itself.", ToolTipIcon.Info);

            Application.Run();
            tray.Visible = false;
        }
    }

    static void StopRunningCopy()
    {
        foreach (var p in Process.GetProcessesByName(AppName))
        {
            try { if (p.Id != Process.GetCurrentProcess().Id) { p.Kill(); p.WaitForExit(3000); } } catch { }
        }
    }

    static bool StartsWithWindows()
    {
        using (var key = Registry.CurrentUser.OpenSubKey(RunKey)) return key != null && key.GetValue(AppName) != null;
    }

    static void SetStartWithWindows(string exe, bool on)
    {
        using (var key = Registry.CurrentUser.CreateSubKey(RunKey))
        {
            if (on) key.SetValue(AppName, "\"" + exe + "\"");
            else key.DeleteValue(AppName, false);
        }
    }

    // ---------------------------------------------------------------- HTTP on 127.0.0.1

    static void Listen()
    {
        TcpListener server;
        try
        {
            server = new TcpListener(IPAddress.Loopback, Port);
            server.Start();
        }
        catch (Exception e)
        {
            MessageBox.Show("The Ray Print Helper could not start (port " + Port + " is busy):\n" + e.Message, "The Ray Print Helper", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        while (true)
        {
            TcpClient client;
            try { client = server.AcceptTcpClient(); } catch { continue; }
            ThreadPool.QueueUserWorkItem(_ => Handle(client));
        }
    }

    static void Handle(TcpClient client)
    {
        using (client)
        {
            try
            {
                client.ReceiveTimeout = 10000;
                var stream = client.GetStream();
                string method, path;
                Dictionary<string, string> headers;
                byte[] body;
                if (!ReadRequest(stream, out method, out path, out headers, out body)) return;

                string origin;
                headers.TryGetValue("origin", out origin);
                bool allowed = origin != null && Array.IndexOf(AllowedOrigins, origin) >= 0;

                var cors = new Dictionary<string, string>();
                if (allowed)
                {
                    cors["Access-Control-Allow-Origin"] = origin;
                    cors["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
                    cors["Access-Control-Allow-Headers"] = "Content-Type, X-Printer";
                    // Chrome asks before a public site talks to this computer (Private Network Access).
                    cors["Access-Control-Allow-Private-Network"] = "true";
                    cors["Access-Control-Max-Age"] = "600";
                    cors["Vary"] = "Origin";
                }

                if (!allowed) { Reply(stream, 403, "{\"error\":\"This site may not use the printer.\"}", cors); return; }
                if (method == "OPTIONS") { Reply(stream, 204, null, cors); return; }

                string route = path.Split('?')[0];
                if (method == "GET" && route == "/status")
                {
                    Reply(stream, 200, StatusJson(), cors);
                    return;
                }
                if (method == "POST" && route == "/print")
                {
                    string printer;
                    headers.TryGetValue("x-printer", out printer);
                    printer = string.IsNullOrEmpty(printer) ? DefaultPrinter() : Uri.UnescapeDataString(printer);
                    if (string.IsNullOrEmpty(printer)) { Reply(stream, 400, "{\"error\":\"No printer is set up in Windows.\"}", cors); return; }
                    byte[] data;
                    try { data = Convert.FromBase64String(Encoding.ASCII.GetString(body).Trim()); }
                    catch { Reply(stream, 400, "{\"error\":\"Bad print data.\"}", cors); return; }
                    string error = RawPrinter.Send(printer, data, "The Ray bill");
                    if (error != null) Reply(stream, 500, "{\"error\":" + Json(error) + "}", cors);
                    else Reply(stream, 200, "{\"ok\":true,\"printer\":" + Json(printer) + "}", cors);
                    return;
                }
                Reply(stream, 404, "{\"error\":\"Not found\"}", cors);
            }
            catch { }
        }
    }

    static bool ReadRequest(NetworkStream stream, out string method, out string path, out Dictionary<string, string> headers, out byte[] body)
    {
        method = path = null; headers = new Dictionary<string, string>(); body = new byte[0];
        var head = new MemoryStream();
        uint last4 = 0;
        // Read up to the blank line (\r\n\r\n) that ends the headers, at most 16 KB.
        while (true)
        {
            if (head.Length >= 16384) return false;
            int b = stream.ReadByte();
            if (b < 0) return false;
            head.WriteByte((byte)b);
            last4 = (last4 << 8) | (uint)b;
            if (last4 == 0x0D0A0D0A) break;
        }
        var lines = Encoding.ASCII.GetString(head.ToArray()).Split(new[] { "\r\n" }, StringSplitOptions.None);
        var first = lines[0].Split(' ');
        if (first.Length < 2) return false;
        method = first[0].ToUpperInvariant();
        path = first[1];
        for (int i = 1; i < lines.Length; i++)
        {
            int c = lines[i].IndexOf(':');
            if (c > 0) headers[lines[i].Substring(0, c).Trim().ToLowerInvariant()] = lines[i].Substring(c + 1).Trim();
        }
        string lengthText;
        int length = 0;
        if (headers.TryGetValue("content-length", out lengthText)) int.TryParse(lengthText, out length);
        if (length < 0 || length > 4 * 1024 * 1024) return false;
        body = new byte[length];
        int read = 0;
        while (read < length)
        {
            int n = stream.Read(body, read, length - read);
            if (n <= 0) return false;
            read += n;
        }
        return true;
    }

    static void Reply(NetworkStream stream, int status, string json, Dictionary<string, string> extra)
    {
        string reason = status == 200 ? "OK" : status == 204 ? "No Content" : status == 400 ? "Bad Request" : status == 403 ? "Forbidden" : status == 404 ? "Not Found" : "Error";
        byte[] payload = json == null ? new byte[0] : Encoding.UTF8.GetBytes(json);
        var sb = new StringBuilder();
        sb.Append("HTTP/1.1 ").Append(status).Append(' ').Append(reason).Append("\r\n");
        if (json != null) sb.Append("Content-Type: application/json; charset=utf-8\r\n");
        sb.Append("Content-Length: ").Append(payload.Length).Append("\r\n");
        sb.Append("Cache-Control: no-store\r\nConnection: close\r\n");
        foreach (var h in extra) sb.Append(h.Key).Append(": ").Append(h.Value).Append("\r\n");
        sb.Append("\r\n");
        byte[] headBytes = Encoding.ASCII.GetBytes(sb.ToString());
        stream.Write(headBytes, 0, headBytes.Length);
        stream.Write(payload, 0, payload.Length);
    }

    static string StatusJson()
    {
        var names = new List<string>();
        foreach (string p in System.Drawing.Printing.PrinterSettings.InstalledPrinters) names.Add(Json(p));
        return "{\"ok\":true,\"version\":" + Json(Version) + ",\"default\":" + Json(DefaultPrinter() ?? "") + ",\"printers\":[" + string.Join(",", names.ToArray()) + "]}";
    }

    static string DefaultPrinter()
    {
        try { var s = new System.Drawing.Printing.PrinterSettings(); return s.IsDefaultPrinter ? s.PrinterName : null; }
        catch { return null; }
    }

    static string Json(string s)
    {
        var sb = new StringBuilder("\"");
        foreach (char c in s)
        {
            if (c == '"' || c == '\\') sb.Append('\\').Append(c);
            else if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
            else sb.Append(c);
        }
        return sb.Append('"').ToString();
    }

    static void TestSlip()
    {
        string printer = DefaultPrinter();
        if (printer == null) { MessageBox.Show("No default printer is set in Windows.", "The Ray Print Helper"); return; }
        var b = new List<byte> { 0x1B, 0x40, 0x1B, 0x61, 1, 0x1B, 0x45, 1 };
        b.AddRange(Encoding.ASCII.GetBytes("THE RAY\n"));
        b.AddRange(new byte[] { 0x1B, 0x45, 0 });
        b.AddRange(Encoding.ASCII.GetBytes("Print Helper is working\n" + DateTime.Now.ToString("dd/MM/yyyy h:mm tt") + "\n\n\n\n"));
        b.AddRange(new byte[] { 0x1D, 0x56, 0x00 });
        string error = RawPrinter.Send(printer, b.ToArray(), "The Ray test slip");
        if (error != null) MessageBox.Show("Could not print to \"" + printer + "\":\n" + error, "The Ray Print Helper", MessageBoxButtons.OK, MessageBoxIcon.Warning);
    }
}

/// <summary>Sends bytes to a Windows printer untouched (the RAW datatype), the standard way to drive a receipt printer.</summary>
static class RawPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    class DOCINFO
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool ClosePrinter(IntPtr handle);
    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern int StartDocPrinter(IntPtr handle, int level, [In] DOCINFO info);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndDocPrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool StartPagePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndPagePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);

    /// <returns>null when sent, otherwise what went wrong.</returns>
    public static string Send(string printer, byte[] data, string docName)
    {
        IntPtr h;
        if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "Printer \"" + printer + "\" was not found (" + Marshal.GetLastWin32Error() + ").";
        try
        {
            if (StartDocPrinter(h, 1, new DOCINFO { pDocName = docName, pDataType = "RAW" }) == 0) return "The printer refused the job (" + Marshal.GetLastWin32Error() + ").";
            try
            {
                StartPagePrinter(h);
                int written;
                bool ok = WritePrinter(h, data, data.Length, out written);
                EndPagePrinter(h);
                if (!ok || written != data.Length) return "Sending to the printer failed (" + Marshal.GetLastWin32Error() + ").";
            }
            finally { EndDocPrinter(h); }
            return null;
        }
        finally { ClosePrinter(h); }
    }
}
