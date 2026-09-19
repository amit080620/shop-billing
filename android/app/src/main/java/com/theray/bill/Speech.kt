package com.theray.bill

import android.Manifest
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import org.json.JSONObject

/** Android's speech recognizer behind the web app's voice billing and voice
 * search (Android's WebView has no Web Speech API of its own). Events use
 * the Web Speech API's names so assets/bridge.js can forward them as is. */
class Speech(private val activity: MainActivity) {
    private var recognizer: SpeechRecognizer? = null
    private var finish: (() -> Unit)? = null

    fun start(lang: String, interim: Boolean, emit: (String, JSONObject) -> Unit) {
        activity.withPermissions(arrayOf(Manifest.permission.RECORD_AUDIO)) { granted ->
            finish?.invoke()
            if (!granted) {
                emit("speech.error", JSONObject().put("error", "not-allowed"))
                emit("speech.end", JSONObject())
                return@withPermissions
            }
            val r = SpeechRecognizer.createSpeechRecognizer(activity)
            var ended = false
            val end = {
                if (!ended) {
                    ended = true
                    emit("speech.end", JSONObject())
                    r.destroy()
                    if (recognizer === r) recognizer = null
                }
            }
            recognizer = r
            finish = end
            r.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) = emit("speech.start", JSONObject())
                override fun onPartialResults(partialResults: Bundle?) {
                    if (interim) textOf(partialResults)?.let { emit("speech.result", JSONObject().put("text", it).put("final", false)) }
                }
                override fun onResults(results: Bundle?) {
                    val text = textOf(results)
                    if (text != null) emit("speech.result", JSONObject().put("text", text).put("final", true))
                    else emit("speech.error", JSONObject().put("error", "no-speech"))
                    end()
                }
                override fun onError(error: Int) {
                    emit("speech.error", JSONObject().put("error", errorName(error)))
                    end()
                }
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
            r.startListening(
                Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                    .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, interim)
                    .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                    .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, activity.packageName),
            )
        }
    }

    /** Stops listening; whatever was heard so far still arrives as the result. */
    fun stop() {
        recognizer?.stopListening()
    }

    private fun textOf(bundle: Bundle?): String? =
        bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.takeIf { it.isNotBlank() }

    private fun errorName(code: Int) = when (code) {
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "not-allowed"
        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no-speech"
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER -> "network"
        SpeechRecognizer.ERROR_AUDIO -> "audio-capture"
        else -> "aborted"
    }
}
