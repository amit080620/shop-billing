package com.theray.bill

import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning

/** Barcode/QR scanning through Google's ML Kit scanner screen. Its native
 * decoder reads 1D shop barcodes (EAN, UPC, Code 128) in poor light and at an
 * angle far better than the JavaScript scanner the web app falls back to, and
 * it needs no camera permission of its own. Requires Google Play services;
 * where those are missing, [available] is false and the web scanner is used. */
class Scanner(private val activity: MainActivity) {
    val available: Boolean
        get() = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(activity) == ConnectionResult.SUCCESS

    /** The scanner screen ships as a module Google Play services downloads on
     * demand. An APK installed by hand doesn't get it at install time, so the
     * first scan would fail while it downloads. Asking for it as soon as the
     * app opens means it is normally ready long before the first scan; until
     * then a failed scan just falls back to the web camera scanner. */
    fun prepare() {
        if (!available) return
        try {
            val client = GmsBarcodeScanning.getClient(activity)
            val installer = ModuleInstall.getClient(activity)
            installer.areModulesAvailable(client).addOnSuccessListener { status ->
                if (!status.areModulesAvailable()) {
                    installer.installModules(ModuleInstallRequest.newBuilder().addApi(client).build())
                }
            }
        } catch (_: Exception) {
            // Best effort only — scanning falls back to the web camera.
        }
    }

    /** Calls [done] once: (code, null) on a scan, (null, null) if the person
     * closed the scanner, (null, message) if it couldn't run. */
    fun scan(done: (String?, String?) -> Unit) {
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_ALL_FORMATS)
            .enableAutoZoom()
            .build()
        GmsBarcodeScanning.getClient(activity, options).startScan()
            .addOnSuccessListener { barcode ->
                val value = barcode.rawValue
                if (value.isNullOrEmpty()) done(null, "Empty barcode") else done(value, null)
            }
            .addOnCanceledListener { done(null, null) }
            .addOnFailureListener { e -> done(null, e.message ?: "Scanner failed") }
    }
}
