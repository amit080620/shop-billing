# The Ray — Android app

A native Android app that runs the live web app (https://bill.theray.in) and
adds what a browser can't do well:

- **Any Bluetooth receipt printer.** Classic Bluetooth (SPP) and BLE, paired
  or new. The printer is picked once and remembered.
- **Voice billing and search** through Android's speech recognizer.
- **Barcode scanning** in Google's native scanner (reads shop barcodes in poor light far better than a web page can; needs Google Play services, otherwise the in-page camera is used), and the **camera** for bill photos.
- **Downloads** of PDFs and Excel/CSV files to `Downloads/The Ray`, with Open
  and Share.
- **Share** to WhatsApp and other apps, and **A4 printing** through Android's
  print service.

The UI is the website, so every web deploy reaches the app immediately. A new
APK is only needed when code in this folder changes.

## How the pieces fit

| File | Role |
|------|------|
| `MainActivity.kt` | WebView, file picker and camera, permissions, links to other apps, status bar, splash, offline screen |
| `Bridge.kt` + `assets/bridge.js` | Message channel, open only to the app's own origin. `bridge.js` adds `window.RayApp` and the polyfills for `SpeechRecognition`, `print()`, `navigator.share()` and blob downloads |
| `Printer.kt` | Printer list, pairing, and sending ESC/POS bytes over SPP or BLE |
| `Speech.kt` | Voice input |
| `Scanner.kt` | Google ML Kit barcode scanner; asks Play services to pre-download its module at launch |
| `Files.kt` | Saving, sharing, and download-manager downloads |

On the web side, `lib/nativeApp.ts` detects the app. `lib/bluetooth-print.ts`
sends receipts through `printer.print` when it runs inside the app.

## Building the APK

Requirements: JDK 17, and Android SDK platform 35 with build-tools 35.0.0.

```sh
cd android
./gradlew assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

For every release, raise both `versionCode` and `versionName` in
`app/build.gradle.kts`. Android refuses to install an update that has the same
or a lower `versionCode`.

## Signing key — keep it safe

Release builds are signed with the key in
`../../android-signing/keystore.properties`, which is outside this repository.
You can point to another location with `RAY_SIGNING=/path/to/keystore.properties`.

**Back up that folder (the `.jks` file and its properties file).** If the key
is lost, installed apps cannot be updated. Every shop would have to uninstall
the app and install it again. Never commit the key, because this repository is
public.
