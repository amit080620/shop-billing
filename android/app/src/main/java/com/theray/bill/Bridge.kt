package com.theray.bill

import android.graphics.Color
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
    private val origin = activity.appUrl.let { u -> "${u.scheme}://${u.host}" + (if (u.port != -1) ":${u.port}" else "") }
    private var channel = false
    private var documentStart = false

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
        val js = activity.assets.open("bridge.js").bufferedReader().use { it.readText() }
        return "window.__RAY_NATIVE_CONFIG=$config;\n$js"
    }

    private fun handle(raw: String, reply: JavaScriptReplyProxy) {
        val msg = try { JSONObject(raw) } catch (e: Exception) { return }
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
