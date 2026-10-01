package com.theray.bill

import android.app.Activity
import android.content.Intent
import android.provider.ContactsContract.CommonDataKinds.Phone
import org.json.JSONObject

/** "Pick from contacts" when adding a customer or vendor. A WebView has no
 * Contact Picker API, so this opens the phone's own contact list for a single
 * phone number. Android hands back only the contact that was picked, so the
 * app needs no permission to read the address book. */
class Contacts(private val activity: MainActivity) {
    /** Calls [done] once: ({name, tel}, null) on a pick, (null, null) if the
     * person backs out, or (null, error). */
    fun pick(done: (JSONObject?, String?) -> Unit) {
        activity.launchForResult(Intent(Intent.ACTION_PICK, Phone.CONTENT_URI)) { code, data ->
            val uri = data?.data
            if (code != Activity.RESULT_OK || uri == null) return@launchForResult done(null, null)
            try {
                activity.contentResolver.query(uri, arrayOf(Phone.DISPLAY_NAME, Phone.NUMBER), null, null, null).use { c ->
                    if (c == null || !c.moveToFirst()) return@use done(null, null)
                    done(JSONObject().put("name", c.getString(0) ?: "").put("tel", c.getString(1) ?: ""), null)
                }
            } catch (e: Exception) {
                done(null, e.message ?: "Couldn't read the contact")
            }
        }
    }
}
