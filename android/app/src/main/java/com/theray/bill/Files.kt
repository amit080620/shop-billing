package com.theray.bill

import android.Manifest
import android.app.AlertDialog
import android.app.DownloadManager
import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.CookieManager
import android.webkit.URLUtil
import androidx.core.content.FileProvider
import org.json.JSONObject
import org.json.JSONArray
import java.io.File

/** Saving and sharing files the web app creates: PDFs, CSV/Excel exports,
 * posters. Saved files go to Downloads/The Ray. */
class Files(private val activity: MainActivity) {
    private val authority = "${activity.packageName}.files"

    fun save(base64: String, name: String, mime: String, done: (String?) -> Unit) {
        val bytes = try { Base64.decode(base64, Base64.DEFAULT) } catch (e: IllegalArgumentException) { return done("Couldn't read the file") }
        val fileName = safeName(name)
        val type = mime.ifBlank { "application/octet-stream" }
        if (Build.VERSION.SDK_INT >= 29) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                put(MediaStore.Downloads.MIME_TYPE, type)
                put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/The Ray")
            }
            val uri = try {
                activity.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?.also { uri -> activity.contentResolver.openOutputStream(uri)?.use { it.write(bytes) } }
            } catch (e: Exception) {
                null
            } ?: return done("Couldn't save the file")
            saved(uri, fileName, type)
            done(null)
        } else {
            activity.withPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE)) { granted ->
                if (!granted) return@withPermissions done("Allow storage permission to save files")
                try {
                    @Suppress("DEPRECATION")
                    val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "The Ray").apply { mkdirs() }
                    val file = unique(dir, fileName).apply { writeBytes(bytes) }
                    saved(FileProvider.getUriForFile(activity, authority, file), file.name, type)
                    done(null)
                } catch (e: Exception) {
                    done("Couldn't save the file")
                }
            }
        }
    }

    /** After saving: open it, share it (WhatsApp etc.) or just close. */
    private fun saved(uri: Uri, name: String, mime: String) {
        activity.runOnUiThread {
            AlertDialog.Builder(activity)
                .setTitle("Saved to Downloads")
                .setMessage("$name\n\nFind it in Downloads › The Ray.")
                .setPositiveButton("Open") { _, _ ->
                    start(Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "No app found to open this file")
                }
                .setNeutralButton("Share") { _, _ -> shareUris(listOf(uri), mime, "", "") }
                .setNegativeButton("Close", null)
                .show()
        }
    }

    fun share(args: JSONObject) {
        val text = listOf(args.optString("text"), args.optString("url")).filter { it.isNotBlank() }.joinToString("\n")
        val files = args.optJSONArray("files") ?: JSONArray()
        if (files.length() == 0) {
            val intent = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
            args.optString("title").takeIf { it.isNotBlank() }?.let { intent.putExtra(Intent.EXTRA_SUBJECT, it) }
            start(Intent.createChooser(intent, "Share"), "No app found to share with")
            return
        }
        val dir = File(activity.cacheDir, "share").apply { deleteRecursively(); mkdirs() }
        val uris = mutableListOf<Uri>()
        var mime = ""
        for (i in 0 until files.length()) {
            val f = files.getJSONObject(i)
            val file = unique(dir, safeName(f.optString("name")))
            file.writeBytes(Base64.decode(f.optString("data"), Base64.DEFAULT))
            uris += FileProvider.getUriForFile(activity, authority, file)
            val type = f.optString("mime").ifBlank { "application/octet-stream" }
            mime = if (mime.isEmpty() || mime == type) type else "*/*"
        }
        shareUris(uris, mime, text, args.optString("title"))
    }

    private fun shareUris(uris: List<Uri>, mime: String, text: String, title: String) {
        val intent = if (uris.size == 1) {
            Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, uris[0])
        } else {
            Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(uris))
        }
        intent.type = mime
        if (text.isNotBlank()) intent.putExtra(Intent.EXTRA_TEXT, text)
        if (title.isNotBlank()) intent.putExtra(Intent.EXTRA_SUBJECT, title)
        intent.clipData = ClipData.newRawUri("", uris[0]).apply { uris.drop(1).forEach { addItem(ClipData.Item(it)) } }
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        start(Intent.createChooser(intent, "Share"), "No app found to share with")
    }

    /** Regular (http) downloads go through Android's download manager with
     * the login cookie; blob:/data: ones are read in the page instead. */
    fun download(url: String, userAgent: String, contentDisposition: String?, mimeType: String?) {
        val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
        if (url.startsWith("blob:") || url.startsWith("data:")) {
            activity.webView.evaluateJavascript("window.RayApp && RayApp.saveUrl(${JSONObject.quote(url)}, ${JSONObject.quote(name)})", null)
            return
        }
        if (!url.startsWith("http")) return
        val enqueue = {
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                CookieManager.getInstance().getCookie(url)?.let { addRequestHeader("Cookie", it) }
                addRequestHeader("User-Agent", userAgent)
                mimeType?.takeIf { it.isNotBlank() }?.let { setMimeType(it) }
                setTitle(name)
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "The Ray/$name")
            }
            (activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            activity.toast("Downloading $name…")
        }
        if (Build.VERSION.SDK_INT >= 29) enqueue()
        else activity.withPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE)) { if (it) enqueue() else activity.toast("Allow storage permission to download") }
    }

    private fun start(intent: Intent, failure: String) {
        try {
            activity.startActivity(intent)
        } catch (e: Exception) {
            activity.toast(failure)
        }
    }

    private fun safeName(name: String) = name.replace(Regex("[\\\\/:*?\"<>|\\x00-\\x1f]"), "_").trim().ifBlank { "download" }

    private fun unique(dir: File, name: String): File {
        var file = File(dir, name)
        val dot = name.lastIndexOf('.').takeIf { it > 0 } ?: name.length
        var n = 1
        while (file.exists()) file = File(dir, "${name.substring(0, dot)} ($n)${name.substring(dot)}").also { n++ }
        return file
    }
}
