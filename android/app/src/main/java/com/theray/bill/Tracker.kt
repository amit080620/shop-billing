package com.theray.bill

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors

/** Van sales route tracking with the screen off (phase two). A foreground service with a "Trip in
 * progress" notification records where the phone is — every two minutes after moving 30 m — and
 * sends the readings to /api/van/ping with the trip's key. Readings wait on the phone while there is
 * no internet. It runs only for one trip, and stops by itself when the server says the trip is off
 * the route (410) or the key is no longer valid (401). Nothing here touches billing. */
class TrackerService : Service(), LocationListener {
    private val handler = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private var lastKept: Location? = null
    private var lastKeptAt = 0L
    private val flushEvery = Runnable { flushSoon(); scheduleFlush() }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopTracking(clear = true)
            return START_NOT_STICKY
        }
        val state = Tracker.state(this)
        if (state == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(), type)
        } catch (e: Exception) {
            // Android refused (for example a restart from the background): the screen-open tracking
            // in the app carries on when it is opened.
            Tracker.clear(this)
            stopSelf()
            return START_NOT_STICKY
        }
        startUpdates(state.everyMs)
        scheduleFlush()
        return START_STICKY
    }

    @SuppressLint("MissingPermission")
    private fun startUpdates(everyMs: Long) {
        val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
        ) {
            stopTracking(clear = true)
            return
        }
        lm.removeUpdates(this)
        // Readings come about every 30 s at most; which of them are kept is decided below.
        val asked = (everyMs / 4).coerceIn(15_000L, 60_000L)
        for (provider in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
            if (lm.isProviderEnabled(provider)) {
                try { lm.requestLocationUpdates(provider, asked, 0f, this, Looper.getMainLooper()) } catch (_: Exception) {}
            }
        }
    }

    override fun onLocationChanged(location: Location) {
        val state = Tracker.state(this) ?: return stopTracking(clear = false)
        if (location.hasAccuracy() && location.accuracy > 1000f) return
        val now = System.currentTimeMillis()
        val last = lastKept
        // The first reading, then one every two minutes once the phone has moved 30 m.
        if (last != null && (now - lastKeptAt < state.everyMs || last.distanceTo(location) < state.minMoveM)) return
        lastKept = location
        lastKeptAt = now
        val ping = JSONObject()
            .put("lat", location.latitude)
            .put("lng", location.longitude)
            .put("at", iso(location.time.takeIf { it > 0 } ?: now))
            .put("source", "auto")
        if (location.hasAccuracy()) ping.put("accuracy", location.accuracy.toDouble())
        if (location.hasSpeed()) ping.put("speed", location.speed.toDouble())
        Tracker.queue(this, ping)
        flushSoon()
    }

    @Deprecated("Needed below Android 10")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    override fun onProviderEnabled(provider: String) {}
    override fun onProviderDisabled(provider: String) {}

    private fun scheduleFlush() {
        handler.removeCallbacks(flushEvery)
        handler.postDelayed(flushEvery, 120_000L)
    }

    /** Sends what waits on the phone, oldest first; stops the service when the trip is over. */
    private fun flushSoon() {
        io.execute {
            val state = Tracker.state(this) ?: return@execute
            val batch = Tracker.waiting(this, 200)
            if (batch.length() == 0) return@execute
            val code = try {
                val conn = (URL(state.url).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 15_000
                    readTimeout = 20_000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("Authorization", "Bearer ${state.key}")
                }
                conn.outputStream.use { it.write(JSONObject().put("tripId", state.tripId).put("pings", batch).toString().toByteArray()) }
                val c = conn.responseCode
                conn.disconnect()
                c
            } catch (_: Exception) {
                -1 // no internet: kept for later
            }
            when {
                code in 200..299 -> Tracker.drop(this, batch.length())
                code == 410 || code == 401 || code == 403 -> handler.post { stopTracking(clear = true) }
                code == 400 -> Tracker.drop(this, batch.length()) // malformed: never accepted, don't retry forever
            }
        }
    }

    private fun stopTracking(clear: Boolean) {
        handler.removeCallbacks(flushEvery)
        try { (getSystemService(Context.LOCATION_SERVICE) as LocationManager).removeUpdates(this) } catch (_: Exception) {}
        if (clear) Tracker.clear(this)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        handler.removeCallbacks(flushEvery)
        try { (getSystemService(Context.LOCATION_SERVICE) as LocationManager).removeUpdates(this) } catch (_: Exception) {}
        io.shutdown()
        super.onDestroy()
    }

    private fun notification(): Notification {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, L.t("trip_channel"), NotificationManager.IMPORTANCE_LOW))
        }
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_trip)
            .setContentTitle(L.t("trip_title"))
            .setContentText(L.t("trip_text"))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    companion object {
        const val ACTION_STOP = "com.theray.bill.TRACKER_STOP"
        private const val CHANNEL = "trip"
        private const val NOTIFICATION_ID = 7301

        private fun iso(ms: Long): String =
            SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date(ms))
    }
}

/** The trip being tracked and the readings waiting to be sent, kept in the app's own preferences so a
 * restart of the service carries on. */
object Tracker {
    private const val PREFS = "ray_tracker"

    data class State(val tripId: String, val key: String, val url: String, val everyMs: Long, val minMoveM: Float)

    fun state(context: Context): State? {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val tripId = p.getString("tripId", null) ?: return null
        val key = p.getString("key", null) ?: return null
        val url = p.getString("url", null) ?: return null
        return State(tripId, key, url, p.getLong("everyMs", 120_000L), p.getFloat("minMoveM", 30f))
    }

    fun start(context: Context, s: State) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("tripId", s.tripId).putString("key", s.key).putString("url", s.url)
            .putLong("everyMs", s.everyMs).putFloat("minMoveM", s.minMoveM)
            .apply()
        val intent = Intent(context, TrackerService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
    }

    fun stop(context: Context) {
        clear(context)
        context.stopService(Intent(context, TrackerService::class.java))
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .remove("tripId").remove("key").remove("url").remove("queue").apply()
    }

    @Synchronized
    fun queue(context: Context, ping: JSONObject) {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val q = JSONArray(p.getString("queue", "[]"))
        q.put(ping)
        // At most 500 readings wait (about 16 hours at one every two minutes); the oldest go first.
        val kept = JSONArray()
        for (i in maxOf(0, q.length() - 500) until q.length()) kept.put(q.get(i))
        p.edit().putString("queue", kept.toString()).apply()
    }

    @Synchronized
    fun waiting(context: Context, max: Int): JSONArray {
        val q = JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("queue", "[]"))
        val out = JSONArray()
        for (i in 0 until minOf(max, q.length())) out.put(q.get(i))
        return out
    }

    @Synchronized
    fun drop(context: Context, count: Int) {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val q = JSONArray(p.getString("queue", "[]"))
        val rest = JSONArray()
        for (i in count until q.length()) rest.put(q.get(i))
        p.edit().putString("queue", rest.toString()).apply()
    }
}
