package com.theray.bill

import android.Manifest
import android.graphics.Color
import android.os.Build
import android.speech.SpeechRecognizer
import android.util.Base64
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/** Message channel between the web app and native code. Only pages from the
 * app's own origin get the channel (window.RayNativeChannel), and on top of
 * it assets/bridge.js builds window.RayApp and the browser API polyfills. */
class Bridge(private val activity: MainActivity, private val files: Files) {
    private val printer = Printer(activity)
    private val speech = Speech(activity)
    private val scanner = Scanner(activity)
    private val contacts = Contacts(activity)
    private val origin = activity.appUrl.let { u -> "${u.scheme}://${u.host}" + (if (u.port != -1) ":${u.port}" else "") }
    private var channel = false
    private var documentStart = false

    init { scanner.prepare() }

    fun install(webView: WebView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        WebViewCompat.addWebMessageListener(webView, "RayNativeChannel", setOf(origin)) { _, message, _, isMainFrame, reply ->
            if (isMainFrame) message.data?.let { handle(it, reply) }
        }
        channel = true
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(webView, script(), setOf(origin))
            documentStart = true
        }
    }

    /** Older WebViews without document-start scripts get the bridge once the page has loaded. */
    fun injectFallback(view: WebView) {
        if (channel && !documentStart && view.url?.startsWith(origin) == true) view.evaluateJavascript(script(), null)
    }

    private fun script(): String {
        val config = JSONObject()
            .put("version", BuildConfig.VERSION_NAME)
            .put("speech", SpeechRecognizer.isRecognitionAvailable(activity))
            .put("barcode", scanner.available)
            .put("location", true)
        val js = activity.assets.open("bridge.js").bufferedReader().use { it.readText() }
        return "window.__RAY_NATIVE_CONFIG=$config;\n$js"
    }

    private fun handle(raw: String, reply: JavaScriptReplyProxy) {
        val msg = try { JSONObject(raw) } catch (e: Exception) { return }
        L.refresh(BuildConfig.APP_URL)
        val id = msg.optInt("id")
        val args = msg.optJSONObject("args") ?: JSONObject()
        val done = { result: Any?, error: String? ->
            val out = JSONObject().put("id", id)
            if (error != null) out.put("error", error) else out.put("result", result ?: JSONObject.NULL)
            send(reply, out)
        }
        val printed = { r: Result<Printer.Info> ->
            r.fold(
                { done(JSONObject().put("address", it.address).put("name", it.name), null) },
                { done(null, it.message ?: "Printing failed") },
            )
        }

        when (msg.optString("method")) {
            "app.info" -> done(JSONObject().put("version", BuildConfig.VERSION_NAME).put("versionCode", BuildConfig.VERSION_CODE), null)
            "printer.print" -> printer.print(args.optString("address").ifEmpty { null }, Base64.decode(args.optString("data"), Base64.DEFAULT), printed)
            "printer.choose" -> printer.choose(printed)
            "print.page" -> { activity.printPage(args.optString("title")); done(null, null) }
            "file.save" -> files.save(args.optString("data"), args.optString("name"), args.optString("mime")) { err -> done(null, err) }
            "share" -> { files.share(args); done(null, null) }
            "speech.start" -> {
                val session = args.optInt("session")
                speech.start(args.optString("lang", "en-IN"), args.optBoolean("interim")) { event, data ->
                    send(reply, JSONObject().put("event", event).put("data", data.put("session", session)))
                }
                done(null, null)
            }
            "speech.stop" -> { speech.stop(); done(null, null) }
            "barcode.scan" -> scanner.scan { code, err ->
                if (err != null) done(null, err) else done(JSONObject().put("code", code ?: JSONObject.NULL), null)
            }
            "contacts.pick" -> contacts.pick { contact, err -> done(contact, err) }
            // Van trip route with the screen off: only to this app's own server, only with a trip key.
            "location.start" -> {
                val url = args.optString("url")
                val tripId = args.optString("tripId")
                val key = args.optString("key")
                if (!url.startsWith("$origin/api/van/ping") || !Regex("^[0-9a-fA-F-]{36}$").matches(tripId) || key.length < 20) {
                    done(null, "Can't start tracking")
                } else {
                    val perms = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                    if (Build.VERSION.SDK_INT >= 33) perms += Manifest.permission.POST_NOTIFICATIONS
                    activity.withPermissions(perms.toTypedArray()) { _ ->
                        if (!activity.hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) && !activity.hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                            done(null, L.t("allow_location"))
                        } else {
                            try {
                                Tracker.start(activity, Tracker.State(tripId, key, url, args.optLong("everyMs", 120_000L).coerceIn(30_000L, 600_000L), args.optDouble("minMoveM", 30.0).toFloat().coerceIn(5f, 500f)))
                                done(JSONObject().put("running", true), null)
                            } catch (e: Exception) {
                                done(null, e.message ?: "Can't start tracking")
                            }
                        }
                    }
                }
            }
            "location.stop" -> { Tracker.stop(activity); done(null, null) }
            "location.status" -> {
                val s = Tracker.state(activity)
                done(JSONObject().put("running", s != null).put("tripId", s?.tripId ?: JSONObject.NULL), null)
            }
            "ui.bars" -> {
                try { activity.setBarColor(Color.parseColor(args.optString("color"))) } catch (_: IllegalArgumentException) {}
                done(null, null)
            }
            else -> done(null, "Unknown method")
        }
    }

    private fun send(reply: JavaScriptReplyProxy, json: JSONObject) {
        activity.runOnUiThread {
            try { reply.postMessage(json.toString()) } catch (_: Exception) { /* page navigated away */ }
        }
    }

    fun close() {
        printer.close()
        speech.stop()
    }
}
