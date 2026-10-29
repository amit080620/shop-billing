/** A Windows setup file for one-click printing. Double-clicked once, it finds Chrome (or Edge, which
 * every Windows 10/11 has), puts a "The Ray - Fast Print" shortcut on the desktop and opens the app
 * from it. That window prints straight to the default printer, with no print dialog.
 *
 * The shortcut uses its own browser profile: Chrome ignores --kiosk-printing when it is already
 * running, so opening it beside a normal Chrome window would otherwise quietly show the dialog again. */
export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const lines = [
    "@echo off",
    "title The Ray - one-click print setup",
    `set "URL=${origin}"`,
    'set "PROFILE=%LOCALAPPDATA%\\TheRayFastPrint"',
    'set "PF86=%ProgramFiles(x86)%"',
    'set "B="',
    'if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" set "B=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not defined B if exist "%PF86%\\Google\\Chrome\\Application\\chrome.exe" set "B=%PF86%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not defined B if exist "%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe" set "B=%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not defined B if exist "%PF86%\\Microsoft\\Edge\\Application\\msedge.exe" set "B=%PF86%\\Microsoft\\Edge\\Application\\msedge.exe"',
    'if not defined B if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" set "B=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"',
    "if not defined B (",
    "  echo Chrome or Edge was not found on this computer. Install Google Chrome and run this file again.",
    "  pause",
    "  exit /b 1",
    ")",
    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\\The Ray - Fast Print.lnk'); $s.TargetPath=$env:B; $q=[char]34; $s.Arguments='--kiosk-printing --user-data-dir='+$q+$env:PROFILE+$q+' --app='+$env:URL; $s.IconLocation=$env:B+',0'; $s.Description='The Ray billing - prints without the dialog'; $s.Save()\"",
    'start "" "%B%" --kiosk-printing --user-data-dir="%PROFILE%" --app=%URL%',
    "echo.",
    "echo Done. A 'The Ray - Fast Print' shortcut is now on your desktop.",
    "echo Log in once in the window that opened. Open The Ray from this shortcut every day.",
    "timeout /t 8 >nul",
  ];
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": 'attachment; filename="TheRay-FastPrint-Setup.cmd"',
      "cache-control": "no-store",
    },
  });
}
