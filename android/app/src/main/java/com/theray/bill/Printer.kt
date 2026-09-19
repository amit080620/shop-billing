package com.theray.bill

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothSocket
import android.bluetooth.BluetoothStatusCodes
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import java.io.IOException
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/** Sends ESC/POS bytes to any Bluetooth receipt printer: classic Bluetooth
 * (SPP, what most 58mm/80mm printers use) and Bluetooth LE. Classic
 * connections stay open for a short while so back-to-back bills print
 * instantly. */
@SuppressLint("MissingPermission")
class Printer(private val activity: MainActivity) {
    data class Info(val address: String, val name: String)

    private val adapter: BluetoothAdapter?
        get() = (activity.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?)?.adapter
    private val worker = Executors.newSingleThreadScheduledExecutor()
    private val main = Handler(Looper.getMainLooper())

    private var socket: BluetoothSocket? = null
    private var socketAddress: String? = null
    private var idleClose: ScheduledFuture<*>? = null

    /** Prints to the saved printer, or asks which printer first. */
    fun print(address: String?, data: ByteArray, done: (Result<Info>) -> Unit) {
        ready(scan = address == null) { error ->
            if (error != null) return@ready done(Result.failure(Exception(error)))
            val saved = address?.let { runCatching { adapter?.getRemoteDevice(it) }.getOrNull() }
            if (saved != null) {
                send(saved, data, done)
            } else {
                pick { device -> if (device == null) done(Result.failure(Exception("cancelled"))) else send(device, data, done) }
            }
        }
    }

    fun choose(done: (Result<Info>) -> Unit) {
        ready(scan = true) { error ->
            if (error != null) return@ready done(Result.failure(Exception(error)))
            pick { device ->
                done(if (device == null) Result.failure(Exception("cancelled")) else Result.success(Info(device.address, nameOf(device))))
            }
        }
    }

    fun close() {
        worker.execute { closeSocket() }
        worker.shutdown()
    }

    // ------------------------------------------------ Permission and power

    private fun ready(scan: Boolean, then: (String?) -> Unit) {
        val adapter = adapter ?: return then("This phone has no Bluetooth")
        val permissions = when {
            Build.VERSION.SDK_INT >= 31 -> arrayOf(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN)
            scan -> arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
            else -> emptyArray()
        }
        activity.withPermissions(permissions) { granted ->
            // Before Android 12, location only matters for finding new
            // printers; paired ones still work without it.
            if (!granted && Build.VERSION.SDK_INT >= 31) {
                return@withPermissions then("Allow the \"Nearby devices\" permission to print over Bluetooth")
            }
            if (adapter.isEnabled) return@withPermissions then(null)
            activity.launchForResult(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)) { _, _ ->
                then(if (adapter.isEnabled) null else "Turn on Bluetooth to print")
            }
        }
    }

    // ------------------------------------------------------ Printer picker

    private class Found(val device: BluetoothDevice, val name: String)

    private fun pick(done: (BluetoothDevice?) -> Unit) {
        val adapter = adapter ?: return done(null)
        val found = mutableListOf<Found>()
        var chosen: BluetoothDevice? = null
        var searching = true

        val builder = AlertDialog.Builder(activity)
        val ctx = builder.context
        val pad = (24 * ctx.resources.displayMetrics.density).toInt()
        val status = TextView(ctx).apply {
            setTextAppearance(android.R.style.TextAppearance_DeviceDefault_Small)
            setPadding(pad, pad / 3, pad, pad / 3)
        }
        val list = object : ArrayAdapter<Found>(ctx, android.R.layout.simple_list_item_2, android.R.id.text1, found) {
            override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
                val view = super.getView(position, convertView, parent)
                val item = getItem(position)!!
                view.findViewById<TextView>(android.R.id.text1).text = item.name
                view.findViewById<TextView>(android.R.id.text2).text =
                    if (item.device.bondState == BluetoothDevice.BOND_BONDED) "Paired · ${item.device.address}" else "New · tap to pair · ${item.device.address}"
                return view
            }
        }
        val listView = ListView(ctx).apply { this.adapter = list }
        val content = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            addView(status)
            addView(listView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }

        fun showStatus() {
            status.text = when {
                found.isNotEmpty() && searching -> "Tap your printer. Still looking for more…"
                found.isNotEmpty() -> "Tap your printer."
                searching -> "Looking for printers… Turn the printer ON and keep it near the phone."
                else -> "No printer found. Turn the printer ON, then pair it in Bluetooth settings (PIN is usually 0000 or 1234)."
            }
        }

        fun add(device: BluetoothDevice?, scanName: String? = null) {
            device ?: return
            val name = device.name ?: scanName ?: return
            if (isClearlyNotAPrinter(device)) return
            val existing = found.indexOfFirst { it.device.address == device.address }
            if (existing >= 0) found[existing] = Found(device, name) else found += Found(device, name)
            found.sortWith(compareByDescending<Found> { looksLikePrinter(it) }.thenByDescending { it.device.bondState == BluetoothDevice.BOND_BONDED })
            list.notifyDataSetChanged()
            showStatus()
        }

        val dialog = builder
            .setTitle("Select printer")
            .setView(content)
            .setNeutralButton("Bluetooth settings", null)
            .setNegativeButton("Cancel", null)
            .create()
        listView.setOnItemClickListener { _, _, which, _ ->
            chosen = found[which].device
            dialog.dismiss()
        }

        val scanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                main.post { add(result.device, result.scanRecord?.deviceName) }
            }
        }
        val stopSearching = Runnable {
            searching = false
            runCatching { adapter.cancelDiscovery() }
            runCatching { adapter.bluetoothLeScanner?.stopScan(scanCallback) }
            showStatus()
        }
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.action) {
                    BluetoothDevice.ACTION_FOUND, BluetoothDevice.ACTION_BOND_STATE_CHANGED -> add(intent.device())
                    BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> { searching = false; showStatus() }
                }
            }
        }
        register(receiver, IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_FOUND)
            addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
            addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
        })

        adapter.bondedDevices.orEmpty().forEach { add(it) }
        val canScan = Build.VERSION.SDK_INT >= 31 || activity.hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)
        if (canScan) {
            runCatching { adapter.startDiscovery() }
            runCatching { adapter.bluetoothLeScanner?.startScan(scanCallback) }
            main.postDelayed(stopSearching, 13_000)
        } else {
            searching = false
        }
        showStatus()

        dialog.setOnDismissListener {
            main.removeCallbacks(stopSearching)
            stopSearching.run()
            runCatching { activity.unregisterReceiver(receiver) }
            done(chosen)
        }
        dialog.show()
        dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener {
            activity.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS))
        }
    }

    private fun looksLikePrinter(found: Found): Boolean =
        found.device.bluetoothClass?.majorDeviceClass == BluetoothClass.Device.Major.IMAGING ||
            PRINTER_NAME.containsMatchIn(found.name)

    private fun isClearlyNotAPrinter(device: BluetoothDevice): Boolean =
        device.bluetoothClass?.majorDeviceClass in setOf(
            BluetoothClass.Device.Major.AUDIO_VIDEO,
            BluetoothClass.Device.Major.PHONE,
            BluetoothClass.Device.Major.COMPUTER,
            BluetoothClass.Device.Major.WEARABLE,
            BluetoothClass.Device.Major.HEALTH,
            BluetoothClass.Device.Major.TOY,
        )

    // ------------------------------------------------------------ Sending

    private fun send(device: BluetoothDevice, data: ByteArray, done: (Result<Info>) -> Unit) {
        runCatching { adapter?.cancelDiscovery() }
        worker.execute {
            val result = runCatching {
                when (device.type) {
                    BluetoothDevice.DEVICE_TYPE_LE -> writeBle(device, data)
                    BluetoothDevice.DEVICE_TYPE_CLASSIC -> writeClassic(device, data)
                    else -> try {
                        writeClassic(device, data)
                    } catch (e: IOException) {
                        writeBle(device, data)
                    }
                }
                Info(device.address, nameOf(device))
            }.recoverCatching { e ->
                throw Exception(
                    if (e is PrinterException) e.message
                    else "Couldn't reach ${nameOf(device)}. Check the printer is ON, charged and near the phone.",
                )
            }
            main.post { done(result) }
        }
    }

    private fun writeClassic(device: BluetoothDevice, data: ByteArray) {
        idleClose?.cancel(false)
        var s = socket
        if (s == null || socketAddress != device.address || !s.isConnected) {
            closeSocket()
            s = connectClassic(device)
        }
        try {
            writeChunks(s.outputStream, data)
        } catch (e: IOException) {
            // The printer dropped the kept-open connection (switched off,
            // slept): reconnect once and send again.
            closeSocket()
            s = connectClassic(device)
            writeChunks(s.outputStream, data)
        }
        idleClose = worker.schedule({ closeSocket() }, 30, TimeUnit.SECONDS)
    }

    private fun connectClassic(device: BluetoothDevice): BluetoothSocket {
        if (device.bondState == BluetoothDevice.BOND_NONE) bond(device)
        val makers = listOf<() -> BluetoothSocket>(
            { device.createRfcommSocketToServiceRecord(SPP) },
            { device.createInsecureRfcommSocketToServiceRecord(SPP) },
            { device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType).invoke(device, 1) as BluetoothSocket },
        )
        var last: Exception? = null
        for (make in makers) {
            val s = try { make() } catch (e: Exception) { last = e; continue }
            try {
                s.connect()
                socket = s
                socketAddress = device.address
                return s
            } catch (e: Exception) {
                last = e
                runCatching { s.close() }
            }
        }
        throw IOException("Could not connect", last)
    }

    private fun writeChunks(out: OutputStream, data: ByteArray) {
        var i = 0
        while (i < data.size) {
            val n = minOf(512, data.size - i)
            out.write(data, i, n)
            out.flush()
            i += n
            Thread.sleep(8)
        }
    }

    /** New printers get paired first; Android shows its own PIN prompt
     * (usually 0000 or 1234) when the printer asks for one. */
    private fun bond(device: BluetoothDevice) {
        val latch = CountDownLatch(1)
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (intent.device()?.address != device.address) return
                if (intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, -1) != BluetoothDevice.BOND_BONDING) latch.countDown()
            }
        }
        register(receiver, IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED))
        try {
            if (device.createBond()) latch.await(60, TimeUnit.SECONDS)
        } finally {
            runCatching { activity.unregisterReceiver(receiver) }
        }
    }

    private fun closeSocket() {
        runCatching { socket?.close() }
        socket = null
        socketAddress = null
    }

    @Suppress("DEPRECATION")
    private fun writeBle(device: BluetoothDevice, data: ByteArray) {
        val failed = AtomicBoolean(false)
        val connected = CountDownLatch(1)
        val mtuSet = CountDownLatch(1)
        val discovered = CountDownLatch(1)
        val written = AtomicReference<CountDownLatch?>(null)
        val mtu = AtomicInteger(23)

        val callback = object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    connected.countDown()
                } else {
                    failed.set(true)
                    listOf(connected, mtuSet, discovered).forEach { it.countDown() }
                    written.get()?.countDown()
                }
            }

            override fun onMtuChanged(gatt: BluetoothGatt, value: Int, status: Int) {
                if (status == BluetoothGatt.GATT_SUCCESS) mtu.set(value)
                mtuSet.countDown()
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) = discovered.countDown()

            override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
                written.get()?.countDown()
            }
        }

        val gatt = device.connectGatt(activity, false, callback, BluetoothDevice.TRANSPORT_LE)
            ?: throw IOException("BLE connection failed")
        try {
            if (!connected.await(10, TimeUnit.SECONDS) || failed.get()) throw IOException("BLE printer not reachable")
            if (gatt.requestMtu(185)) mtuSet.await(3, TimeUnit.SECONDS)
            gatt.discoverServices()
            if (!discovered.await(8, TimeUnit.SECONDS) || failed.get()) throw IOException("BLE services not found")
            val target = writableCharacteristic(gatt) ?: throw PrinterException("Connected, but this printer has no print channel we can write to.")

            val noResponse = target.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0
            val writeType = if (noResponse) BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE else BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            val chunk = (mtu.get() - 3).coerceIn(20, 180)
            var i = 0
            var busy = 0
            while (i < data.size) {
                val part = data.copyOfRange(i, minOf(i + chunk, data.size))
                val latch = CountDownLatch(1)
                written.set(latch)
                val queued = if (Build.VERSION.SDK_INT >= 33) {
                    gatt.writeCharacteristic(target, part, writeType) == BluetoothStatusCodes.SUCCESS
                } else {
                    target.writeType = writeType
                    target.value = part
                    gatt.writeCharacteristic(target)
                }
                if (!queued) {
                    if (++busy > 100) throw IOException("BLE printer busy")
                    Thread.sleep(20)
                    continue
                }
                busy = 0
                latch.await(2, TimeUnit.SECONDS)
                if (failed.get()) throw IOException("BLE printer disconnected")
                i += part.size
                if (noResponse) Thread.sleep(10)
            }
            Thread.sleep(300)
        } finally {
            runCatching { gatt.disconnect() }
            runCatching { gatt.close() }
        }
    }

    private fun writableCharacteristic(gatt: BluetoothGatt): BluetoothGattCharacteristic? {
        val services = gatt.services.sortedByDescending { it.uuid in KNOWN_SERVICES }
        for (service in services) {
            for (c in service.characteristics) {
                val p = c.properties
                if (p and (BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) return c
            }
        }
        return null
    }

    // ------------------------------------------------------------ Helpers

    private fun nameOf(device: BluetoothDevice) = device.name ?: device.address

    private fun register(receiver: BroadcastReceiver, filter: IntentFilter) {
        if (Build.VERSION.SDK_INT >= 33) activity.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        else activity.registerReceiver(receiver, filter)
    }

    private fun Intent.device(): BluetoothDevice? =
        if (Build.VERSION.SDK_INT >= 33) getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
        else @Suppress("DEPRECATION") getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)

    private class PrinterException(message: String) : Exception(message)

    companion object {
        private val SPP: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
        private val KNOWN_SERVICES = setOf(
            "000018f0-0000-1000-8000-00805f9b34fb",
            "0000ff00-0000-1000-8000-00805f9b34fb",
            "0000ffe0-0000-1000-8000-00805f9b34fb",
            "49535343-fe7d-4ae5-8fa9-9fafd205e455",
            "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
        ).map(UUID::fromString).toSet()
        private val PRINTER_NAME = Regex("print|pos|thermal|mpt|rpp|pt-?\\d|xp-|mtp|zj|bt-?\\d|inner|goojprt|milestone|hoin|epson|tvs", RegexOption.IGNORE_CASE)
    }
}
