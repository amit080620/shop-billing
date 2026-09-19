package com.theray.bill

import android.webkit.CookieManager

/** Native text in the language chosen inside the app (the web app's "lang"
 * cookie: en, hi or mr), not the phone's system language. */
object L {
    @Volatile
    private var index = 0

    fun refresh(appUrl: String) {
        val cookies = CookieManager.getInstance().getCookie(appUrl) ?: ""
        index = when (Regex("(?:^|;\\s*)lang=(hi|mr)").find(cookies)?.groupValues?.get(1)) {
            "hi" -> 1
            "mr" -> 2
            else -> 0
        }
    }

    fun t(key: String, vararg args: Any): String {
        val text = TEXT[key]?.get(index) ?: return key
        return if (args.isEmpty()) text else String.format(text, *args)
    }

    private val TEXT: Map<String, Array<String>> = mapOf(
        // Printer picker
        "select_printer" to arrayOf("Select printer", "प्रिंटर चुनें", "प्रिंटर निवडा"),
        "bt_settings" to arrayOf("Bluetooth settings", "ब्लूटूथ सेटिंग्स", "ब्लूटूथ सेटिंग्ज"),
        "cancel" to arrayOf("Cancel", "रद्द करें", "रद्द करा"),
        "paired" to arrayOf("Paired · %s", "पेयर्ड · %s", "जोडलेला · %s"),
        "new_device" to arrayOf("New · tap to pair · %s", "नया · पेयर करने के लिए टैप करें · %s", "नवीन · जोडण्यासाठी टॅप करा · %s"),
        "found_searching" to arrayOf("Tap your printer. Still looking for more…", "अपना प्रिंटर टैप करें। और खोज रहे हैं…", "तुमचा प्रिंटर टॅप करा. अजून शोधत आहे…"),
        "found" to arrayOf("Tap your printer.", "अपना प्रिंटर टैप करें।", "तुमचा प्रिंटर टॅप करा."),
        "searching" to arrayOf(
            "Looking for printers… Turn the printer ON and keep it near the phone.",
            "प्रिंटर खोज रहे हैं… प्रिंटर चालू करें और फ़ोन के पास रखें।",
            "प्रिंटर शोधत आहे… प्रिंटर चालू करा आणि फोनजवळ ठेवा.",
        ),
        "none_found" to arrayOf(
            "No printer found. Turn the printer ON, then pair it in Bluetooth settings (PIN is usually 0000 or 1234).",
            "कोई प्रिंटर नहीं मिला। प्रिंटर चालू करें, फिर ब्लूटूथ सेटिंग्स में पेयर करें (PIN अक्सर 0000 या 1234)।",
            "प्रिंटर सापडला नाही. प्रिंटर चालू करा, मग ब्लूटूथ सेटिंग्जमध्ये जोडा (PIN सहसा 0000 किंवा 1234).",
        ),

        // Printing errors (shown under the Print button)
        "no_bluetooth" to arrayOf("This phone has no Bluetooth.", "इस फ़ोन में ब्लूटूथ नहीं है।", "या फोनमध्ये ब्लूटूथ नाही."),
        "allow_nearby" to arrayOf(
            "Allow the \"Nearby devices\" permission to print over Bluetooth.",
            "ब्लूटूथ से प्रिंट के लिए \"Nearby devices\" की अनुमति दें।",
            "ब्लूटूथवरून प्रिंटसाठी \"Nearby devices\" परवानगी द्या.",
        ),
        "turn_on_bt" to arrayOf("Turn on Bluetooth to print.", "प्रिंट के लिए ब्लूटूथ चालू करें।", "प्रिंटसाठी ब्लूटूथ चालू करा."),
        "cant_reach" to arrayOf(
            "Couldn't reach %s. Check the printer is ON, charged and near the phone, then tap Print again to choose the printer.",
            "%s से कनेक्ट नहीं हुआ। देखें कि प्रिंटर चालू, चार्ज और फ़ोन के पास है, फिर प्रिंटर चुनने के लिए दोबारा प्रिंट दबाएं।",
            "%s शी जोडणी झाली नाही. प्रिंटर चालू, चार्ज आणि फोनजवळ आहे का ते पहा, मग प्रिंटर निवडण्यासाठी पुन्हा प्रिंट दाबा.",
        ),
        "no_channel" to arrayOf(
            "Connected, but this printer has no print channel we can write to.",
            "कनेक्ट हुआ, पर इस प्रिंटर में प्रिंट भेजने का रास्ता नहीं मिला।",
            "जोडले, पण या प्रिंटरमध्ये प्रिंट पाठवण्याचा मार्ग सापडला नाही.",
        ),

        // Files and sharing
        "saved_title" to arrayOf("Saved to Downloads", "डाउनलोड्स में सेव हुआ", "डाउनलोड्समध्ये सेव्ह झाले"),
        "saved_where" to arrayOf("%s\n\nFind it in Downloads › The Ray.", "%s\n\nडाउनलोड्स › The Ray में देखें।", "%s\n\nडाउनलोड्स › The Ray मध्ये पहा."),
        "open" to arrayOf("Open", "खोलें", "उघडा"),
        "share" to arrayOf("Share", "शेयर करें", "शेअर करा"),
        "close" to arrayOf("Close", "बंद करें", "बंद करा"),
        "choose_file" to arrayOf("Choose file", "फ़ाइल चुनें", "फाइल निवडा"),
        "no_app_file" to arrayOf("No app found to open this file", "यह फ़ाइल खोलने के लिए कोई ऐप नहीं मिला", "ही फाइल उघडण्यासाठी ॲप सापडले नाही"),
        "no_app_share" to arrayOf("No app found to share with", "शेयर करने के लिए कोई ऐप नहीं मिला", "शेअर करण्यासाठी ॲप सापडले नाही"),
        "no_app_link" to arrayOf("No app found to open this link", "यह लिंक खोलने के लिए कोई ऐप नहीं मिला", "ही लिंक उघडण्यासाठी ॲप सापडले नाही"),
        "cant_save" to arrayOf("Couldn't save the file", "फ़ाइल सेव नहीं हो पाई", "फाइल सेव्ह झाली नाही"),
        "cant_read" to arrayOf("Couldn't read the file", "फ़ाइल पढ़ी नहीं जा सकी", "फाइल वाचता आली नाही"),
        "allow_storage" to arrayOf("Allow storage permission to save files", "फ़ाइल सेव करने के लिए स्टोरेज की अनुमति दें", "फाइल सेव्ह करण्यासाठी स्टोरेज परवानगी द्या"),
        "downloading" to arrayOf("Downloading %s…", "%s डाउनलोड हो रहा है…", "%s डाउनलोड होत आहे…"),
    )
}
