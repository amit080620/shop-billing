@echo off
rem Builds TheRayPrintHelper.exe with the C# compiler that comes with Windows (.NET Framework 4).
setlocal
cd /d "%~dp0"
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
"%CSC%" /nologo /target:winexe /optimize+ /platform:anycpu /win32icon:..\app\favicon.ico /out:TheRayPrintHelper.exe /r:System.Windows.Forms.dll /r:System.Drawing.dll TheRayPrintHelper.cs
