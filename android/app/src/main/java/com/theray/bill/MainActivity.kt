package com.theray.bill

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.MediaStore
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File

/** The whole app is the live web app (so every web deploy reaches phones
 * instantly) inside a WebView, plus native code for what a browser can't do
 * well: Bluetooth printers, voice, camera, printing, sharing and downloads. */
class MainActivity : Activity() {
    lateinit var webView: WebView
        private set
    private lateinit var root: FrameLayout
    private lateinit var progress: ProgressBar
    private lateinit var bridge: Bridge
    private lateinit var files: Files

    val appUrl: Uri = Uri.parse(BuildConfig.APP_URL)
    private var pageReady = false

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var cameraFile: File? = null
    private var cameraUri: Uri? = null

    private val permissionCallbacks = HashMap<Int, (Boolean) -> Unit>()
    private val resultCallbacks = HashMap<Int, (Int, Intent?) -> Unit>()
    private var nextRequestCode = 100

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        root = FrameLayout(this)
        webView = WebView(this)
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progressTintList = ColorStateList.valueOf(Color.parseColor("#4F46E5"))
            visibility = View.GONE
        }
        root.addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(progress, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3), Gravity.TOP))
        setContentView(root)
        setupInsets()
        setBarColor(Color.WHITE)
        keepSplashUntilLoaded()

        files = Files(this)
        setupWebView()
        File(cacheDir, "camera").deleteRecursively()

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(BuildConfig.APP_URL)
        }
    }

    // ---------------------------------------------------------------- WebView

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = true
            setGeolocationEnabled(true)
            userAgentString = "$userAgentString TheRayApp/${BuildConfig.VERSION_NAME}"
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = Client()
        webView.webChromeClient = Chrome()
        webView.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            files.download(url, userAgent, contentDisposition, mimeType)
        }
        bridge = Bridge(this, files)
        bridge.install(webView)
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = handleUrl(request.url)

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            progress.visibility = View.VISIBLE
        }

        override fun onPageFinished(view: WebView, url: String?) {
            progress.visibility = View.GONE
            pageReady = true
            L.refresh(BuildConfig.APP_URL)
            bridge.injectFallback(view)
            CookieManager.getInstance().flush()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            val failed = request.url.toString()
            pageReady = true
            view.loadUrl("file:///android_asset/offline.html#" + Uri.encode(failed))
        }
    }

    private inner class Chrome : WebChromeClient() {
        override fun onProgressChanged(view: WebView, newProgress: Int) {
            progress.progress = newProgress
            if (newProgress >= 100) progress.visibility = View.GONE
        }

        // Camera for the barcode scanner, microphone for voice notes.
        override fun onPermissionRequest(request: PermissionRequest) {
            if (request.origin.host != appUrl.host) return request.deny()
            val perms = mutableListOf<String>()
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE in request.resources) perms += Manifest.permission.CAMERA
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE in request.resources) perms += Manifest.permission.RECORD_AUDIO
            withPermissions(perms.toTypedArray()) { ok -> if (ok) request.grant(request.resources) else request.deny() }
        }

        override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
            withPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) {
                callback.invoke(origin, hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION), false)
            }
        }

        // <input type="file">: camera straight away for capture="environment"
        // (bill scan, shelf photo), otherwise the file/gallery picker.
        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            val accepts = params.acceptTypes.flatMap { it.split(",") }.map { it.trim().lowercase() }.filter { it.isNotEmpty() }
            val wantsImage = accepts.isEmpty() || accepts.any { it.startsWith("image") || it == "*/*" }
            if (params.isCaptureEnabled && wantsImage) {
                withPermissions(arrayOf(Manifest.permission.CAMERA)) { ok ->
                    val camera = if (ok) cameraIntent() else null
                    chooseFile(camera ?: pickerIntent(accepts, params.mode == FileChooserParams.MODE_OPEN_MULTIPLE))
                }
            } else {
                val picker = pickerIntent(accepts, params.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
                val camera = if (wantsImage && hasPermission(Manifest.permission.CAMERA)) cameraIntent() else null
                chooseFile(
                    Intent.createChooser(picker, L.t("choose_file")).apply {
                        if (camera != null) putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(camera))
                    },
                )
            }
            return true
        }
    }

    private fun pickerIntent(accepts: List<String>, multiple: Boolean): Intent {
        // Extensions like ".csv" map to inconsistent MIME types across file
        // managers, so any extension means "show everything".
        val mimes = if (accepts.any { it.startsWith(".") }) emptyList() else accepts.distinct()
        return Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = if (mimes.size == 1) mimes[0] else "*/*"
            if (mimes.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, mimes.toTypedArray())
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
        }
    }

    private fun cameraIntent(): Intent? {
        val dir = File(cacheDir, "camera").apply { mkdirs() }
        val file = File(dir, "photo-${System.currentTimeMillis()}.jpg")
        val uri = try {
            FileProvider.getUriForFile(this, "$packageName.files", file)
        } catch (e: Exception) {
            return null
        }
        cameraFile = file
        cameraUri = uri
        return Intent(MediaStore.ACTION_IMAGE_CAPTURE)
            .putExtra(MediaStore.EXTRA_OUTPUT, uri)
            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    private fun chooseFile(intent: Intent) {
        launchForResult(intent) { code, data ->
            val callback = fileCallback
            fileCallback = null
            val uris = mutableListOf<Uri>()
            if (code == RESULT_OK) {
                data?.clipData?.let { clip -> for (i in 0 until clip.itemCount) uris += clip.getItemAt(i).uri }
                data?.data?.let { if (it !in uris) uris += it }
                if (uris.isEmpty() && (cameraFile?.length() ?: 0L) > 0L) cameraUri?.let { uris += it }
            }
            cameraFile = null
            cameraUri = null
            callback?.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
        }
    }

    /** Pages of the app stay inside; everything else (WhatsApp, UPI, phone,
     * maps, other websites) opens in the app that handles it. */
    private fun handleUrl(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase() ?: return false
        if ((scheme == "https" || scheme == "http") && uri.host == appUrl.host) return false
        if (scheme in setOf("blob", "data", "about", "javascript")) return false
        if (scheme == "file" && uri.toString().startsWith("file:///android_asset/")) return false
        openExternal(uri)
        return true
    }

    fun openExternal(uri: Uri) {
        try {
            val intent = if (uri.scheme == "intent") {
                Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME).apply {
                    addCategory(Intent.CATEGORY_BROWSABLE)
                    component = null
                    selector = null
                }
            } else {
                Intent(Intent.ACTION_VIEW, uri)
            }
            try {
                startActivity(intent)
            } catch (e: ActivityNotFoundException) {
                val fallback = intent.getStringExtra("browser_fallback_url")
                if (fallback != null) startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(fallback))) else throw e
            }
        } catch (e: Exception) {
            toast(L.t("no_app_link"))
        }
    }

    fun printPage(title: String) {
        val name = title.ifBlank { "The Ray" }
        val printManager = getSystemService(PRINT_SERVICE) as PrintManager
        printManager.print(name, webView.createPrintDocumentAdapter(name), PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build())
    }

    // ------------------------------------------------------ Window and bars

    private fun setupInsets() {
        if (Build.VERSION.SDK_INT < 30) return
        window.setDecorFitsSystemWindows(false)
        root.setOnApplyWindowInsetsListener { v, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            val ime = insets.getInsets(WindowInsets.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            WindowInsets.CONSUMED
        }
    }

    @Suppress("DEPRECATION")
    fun setBarColor(color: Int) {
        root.setBackgroundColor(color)
        window.statusBarColor = color
        window.navigationBarColor = color
        val light = (Color.red(color) * 299 + Color.green(color) * 587 + Color.blue(color) * 114) / 1000 > 150
        if (Build.VERSION.SDK_INT >= 30) {
            val mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            window.insetsController?.setSystemBarsAppearance(if (light) mask else 0, mask)
        } else {
            var flags = window.decorView.systemUiVisibility and
                (View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR).inv()
            if (light) flags = flags or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or
                (if (Build.VERSION.SDK_INT >= 26) View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR else 0)
            window.decorView.systemUiVisibility = flags
        }
    }

    /** Shows the splash (logo) until the first page has loaded instead of a
     * blank white screen, capped so a slow network never hides the app. */
    private fun keepSplashUntilLoaded() {
        val started = System.currentTimeMillis()
        root.viewTreeObserver.addOnPreDrawListener(object : ViewTreeObserver.OnPreDrawListener {
            override fun onPreDraw(): Boolean {
                if (!pageReady && System.currentTimeMillis() - started < 5000) return false
                root.viewTreeObserver.removeOnPreDrawListener(this)
                return true
            }
        })
    }

    // ------------------------------------------ Permissions and results

    fun hasPermission(permission: String) = checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    fun withPermissions(permissions: Array<String>, then: (Boolean) -> Unit) {
        val missing = permissions.filterNot(::hasPermission)
        if (missing.isEmpty()) return then(true)
        val code = nextRequestCode++
        permissionCallbacks[code] = then
        requestPermissions(missing.toTypedArray(), code)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        permissionCallbacks.remove(requestCode)?.invoke(grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED })
    }

    fun launchForResult(intent: Intent, then: (Int, Intent?) -> Unit) {
        val code = nextRequestCode++
        resultCallbacks[code] = then
        try {
            startActivityForResult(intent, code)
        } catch (e: ActivityNotFoundException) {
            resultCallbacks.remove(code)
            then(RESULT_CANCELED, null)
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        resultCallbacks.remove(requestCode)?.invoke(resultCode, data)
    }

    // ---------------------------------------------------------- Lifecycle

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else moveTaskToBack(true)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onDestroy() {
        bridge.close()
        webView.destroy()
        super.onDestroy()
    }

    fun toast(message: String) = runOnUiThread { Toast.makeText(this, message, Toast.LENGTH_LONG).show() }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
}

