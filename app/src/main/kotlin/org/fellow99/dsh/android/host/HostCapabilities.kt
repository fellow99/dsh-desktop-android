package org.fellow99.dsh.android.host

import android.app.Application
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.Environment
import org.fellow99.dsh.android.BuildConfig
import org.fellow99.dsh.android.common.AppLog
import org.fellow99.dsh.android.common.Constants
import org.fellow99.nodebridge.NodeRuntime
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * 宿主能力面（§6.4 冻结命名的首批子集）。纪律：
 * - 结构化 JSON 进出、永不抛异常（handler 内 try/catch → {"ok":false,"error":…}）；
 * - 未注册由桥返回 {"ok":false,"error":"unregistered"}；未实现的能力显式 not-implemented；
 * - handler 在主线程执行：**只做内存/系统查询，不做阻塞 IO**（大 IO 由 Node 侧 fs 完成）。
 */
object HostCapabilities {

    private const val NOTIFY_CHANNEL = "dsh-events"

    @Volatile
    private var appRef: Application? = null

    /** 可见 Activity 计数（T-011 前台门事实源）。 */
    private val resumedActivities = java.util.concurrent.atomic.AtomicInteger(0)

    /** 两段式槽位（§6.4）：pending → done/expired；5 分钟过期；Activity 恢复时解析。 */
    private object PendingSlots {
        enum class State { PENDING, DONE, EXPIRED }
        class Slot(val kind: String) {
            @Volatile var state: State = State.PENDING
            @Volatile var resultJson: String = """{"granted":false}"""
            val createdAt: Long = System.currentTimeMillis()
        }

        private val map = ConcurrentHashMap<String, Slot>()
        private val seq = AtomicLong(0)

        fun create(kind: String = "allFiles"): String =
            "slot-${seq.incrementAndGet()}-${System.currentTimeMillis()}".also { map[it] = Slot(kind) }
        fun get(id: String): Slot? {
            val s = map[id] ?: return null
            // TTL 按 kind 区分：perm 设置页往返 5 分钟；SAF 选文件（浏览/多选/重命名）放宽到 15 分钟
            val ttlMs = if (s.kind == "pickFiles" || s.kind == "saveFile") 15 * 60_000 else 5 * 60_000
            if (s.state == State.PENDING && System.currentTimeMillis() - s.createdAt > ttlMs) s.state = State.EXPIRED
            return s
        }
        fun remove(id: String) { map.remove(id) }

        /** 原子取走（防并发轮询双消费同一结果）。 */
        fun take(id: String): Slot? = map.remove(id)
        fun completeAllFiles(id: String, granted: Boolean) {
            map[id]?.let {
                it.resultJson = """{"granted":$granted}"""
                it.state = State.DONE
            }
        }

        /** 通用完成入口（SAF 委托页回调等）：任意 kind 槽位写入结果并置 DONE。 */
        fun complete(id: String, resultJson: String) {
            map[id]?.let {
                if (it.state == State.EXPIRED) {
                    AppLog.line("warn", "slot", "complete on EXPIRED slot id=$id kind=${it.kind}（结果丢弃）")
                }
                it.resultJson = resultJson
                it.state = State.DONE
            }
        }

        fun launchAllFilesSettings(app: Application, id: String) {
            val intent = Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
                .setData(android.net.Uri.parse("package:${app.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            app.startActivity(intent)
            AppLog.line("info", "perm", "launch All-files settings, slot=$id")
        }

        /** 应用回到前台时解析 pending 的 All-files 槽位（用户从设置页返回）。 */
        fun onAppResumed(app: Application) {
            map.values.filter { it.state == State.PENDING && it.kind == "allFiles" }.forEach { slot ->
                val granted = Build.VERSION.SDK_INT >= 30 && Environment.isExternalStorageManager()
                if (granted) completeAllFiles(map.entries.firstOrNull { it.value === slot }?.key ?: "", true)
            }
        }
    }

    /** 由 DshApplication 的 ActivityLifecycleCallbacks 在 onActivityResumed 时调用。 */
    fun onAppResumed(app: Application) {
        resumedActivities.incrementAndGet()
        PendingSlots.onAppResumed(app)
    }

    /** 前台计数递减（T-011：notify 前台门的事实源）。 */
    fun onAppPaused(app: Application) {
        resumedActivities.decrementAndGet()
    }

    /** SAF 委托页回调入口：完成任意槽位（host.result 轮询方随后取走结果）。 */
    fun completeSlot(id: String, resultJson: String) {
        PendingSlots.complete(id, resultJson)
    }

    /** 应用是否有可见 Activity（T-011）。 */
    fun isForeground(): Boolean = resumedActivities.get() > 0

    fun register(app: Application, runtime: NodeRuntime) {
        appRef = app
        // 通用回声（联调用）：args 由桥序列化为 JSON 字符串；经 guard 解析后重建，避免拼接非法 JSON
        runtime.host.register("echo") { args ->
            guard(args) { json ->
                """{"ok":true,"echo":$json,"handledBy":"kotlin"}"""
            }
        }
        runtime.host.register("log.write") { args ->
            guard(args) { json ->
                val level = json.optString("level", "info")
                val tag = json.optString("tag", "node")
                val msg = json.optString("msg", "")
                AppLog.line(level, tag, msg)
                """{"ok":true}"""
            }
        }

        runtime.host.register("runtime.facts") { _ ->
            guard("{}") { _ ->
                facts(app)
            }
        }

        // §6.4 perm.allFiles.status（正式能力；store flavor 恒 false）
        runtime.host.register("perm.allFiles.status") { _ ->
            guard("{}") { _ ->
                val granted = BuildConfig.DSH_STORAGE_MODE == "full" &&
                    Build.VERSION.SDK_INT >= 30 && Environment.isExternalStorageManager()
                """{"ok":true,"granted":$granted,"sdkInt":${Build.VERSION.SDK_INT},"storageMode":"${BuildConfig.DSH_STORAGE_MODE}"}"""
            }
        }

        // [PROBE] P0 门禁 G8 证据：All-files 授权下 Documents/Download 可列可写（探针阶段临时）
        runtime.host.register("probe.allFiles") { _ ->
            guard("{}") { _ ->
                probeAllFiles()
            }
        }

        // §6.4 image.normalize：sharp 替身（@dsh-android/attachment-image）的像素操作出口。
        // 入参/出参契约见 packages/attachment-image-android（data=base64 → {ok,data,format,width,height}）。
        runtime.host.register("image.normalize") { args ->
            guard(args) { json ->
                imageNormalize(json)
            }
        }

        // §6.4 两段式（P2）：perm.request —— 跳系统设置页（All-files），立即返回 pending，
        // 用户授权后回到应用时由 onAppResumed() 解析槽位；客户端经 host.result 轮询。
        runtime.host.register("perm.request") { args ->
            guard(args) { json ->
                val names = json.optJSONArray("names")
                val wantsAllFiles = (0 until (names?.length() ?: 0)).any {
                    val n = names?.optString(it, "") ?: ""
                    n.contains("allFiles", true) || n.contains("EXTERNAL_STORAGE", true) ||
                        n.contains("DOCUMENTS", true) || n.contains("DOWNLOAD", true) || n.contains("DESKTOP", true)
                } || names == null
                if (!wantsAllFiles) {
                    """{"ok":false,"error":"not-implemented","hint":"仅支持 All-files 类权限请求"}"""
                } else if (Build.VERSION.SDK_INT >= 30 && Environment.isExternalStorageManager()) {
                    """{"ok":true,"granted":true}"""
                } else {
                    val id = PendingSlots.create()
                    PendingSlots.launchAllFilesSettings(app, id)
                    """{"ok":true,"pending":true,"id":"$id"}"""
                }
            }
        }

        // §6.4 两段式：结果查询（只读内存槽位表；TTL 按 kind：perm 5min / SAF 15min）
        runtime.host.register("host.result") { args ->
            guard(args) { json ->
                val id = json.optString("id", "")
                val slot = PendingSlots.take(id) ?: return@guard """{"ok":true,"state":"expired"}"""
                when (slot.state) {
                    PendingSlots.State.PENDING -> {
                        PendingSlots.complete(id, slot.resultJson) // 放回（仍 pending）
                        """{"ok":true,"state":"pending"}"""
                    }
                    PendingSlots.State.DONE -> """{"ok":true,"state":"done","result":${slot.resultJson}}"""
                    PendingSlots.State.EXPIRED -> """{"ok":true,"state":"expired"}"""
                }
            }
        }

        // §6.4 perm.check：{name} → {granted}（All-files 语义名 → isExternalStorageManager）
        runtime.host.register("perm.check") { args ->
            guard(args) { json ->
                val granted = Build.VERSION.SDK_INT >= 30 && Environment.isExternalStorageManager()
                """{"ok":true,"granted":$granted,"name":${JSONObject.quote(json.optString("name", ""))}}"""
            }
        }

        // §6.4 notify.show：channel dsh-events；POST_NOTIFICATIONS（33+）缺失时如实失败
        runtime.host.register("notify.show") { args ->
            guard(args) { json ->
                notifyShow(json)
            }
        }

        // §6.4 shell.openExternal：https/http 直通；工作区内 file:// 经 WorkspaceFilesProvider
        // 转 content://（T-005，P3 路线落地，FLAG_GRANT_READ）；其余如实降级
        runtime.host.register("shell.openExternal") { args ->
            guard(args) { json ->
                val app = appRef ?: return@guard err("app 未初始化")
                val uri = json.optString("uri", "")
                val parsed = android.net.Uri.parse(uri)
                val contentUri = when {
                    parsed.scheme == "https" || parsed.scheme == "http" -> parsed
                    parsed.scheme == "file" -> {
                        val file = java.io.File(parsed.path ?: "")
                        if (!file.isFile) {
                            return@guard """{"ok":false,"error":"not-found","hint":"file 不存在或不是文件"}"""
                        }
                        WorkspaceFilesProvider.uriForFile(app, file)
                            ?: return@guard """{"ok":false,"error":"outside-workspace-fence","hint":"file 外打开当前仅支持应用沙箱工作区内的文件"}"""
                    }
                    else -> null
                }
                if (contentUri == null) {
                    return@guard """{"ok":false,"error":"not-implemented","hint":"openExternal 支持 https/http 与工作区内 file://；其余 scheme 不支持"}"""
                }
                val mime = if (contentUri.scheme == "content") app.contentResolver.getType(contentUri) else null
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    if (mime != null) setDataAndType(contentUri, mime) else setData(contentUri)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                app.startActivity(intent)
                """{"ok":true,"served":"${contentUri.scheme}://${contentUri.authority}"}"""
            }
        }

        // §6.4 clipboard.writeText：{text} → 系统剪贴板（P2-4）
        runtime.host.register("clipboard.writeText") { args ->
            guard(args) { json ->
                val app = appRef ?: return@guard err("app 未初始化")
                val text = json.optString("text", "")
                val cm = app.getSystemService(android.content.ClipboardManager::class.java)
                    ?: return@guard err("ClipboardManager 不可用")
                cm.setPrimaryClip(android.content.ClipData.newPlainText("dsh", text))
                """{"ok":true}"""
            }
        }

        // §6.4 clipboard.readImage：剪贴板含 image/* 时返回 base64（P2-4；读文本走客户端浏览器 API）
        runtime.host.register("clipboard.readImage") { _ ->
            guard("{}") { _ ->
                val app = appRef ?: return@guard err("app 未初始化")
                val cm = app.getSystemService(android.content.ClipboardManager::class.java)
                    ?: return@guard err("ClipboardManager 不可用")
                val clip = cm.primaryClip
                if (clip == null || clip.itemCount == 0) return@guard """{"ok":false,"error":"clipboard-empty"}"""
                val item = clip.getItemAt(0)
                val uri = item.uri
                val isImage = clip.description?.hasMimeType("image/*") == true ||
                    (uri != null && app.contentResolver.getType(uri)?.startsWith("image/") == true)
                if (!isImage || uri == null) return@guard """{"ok":false,"error":"clipboard-not-image"}"""
                // 尺寸门：>6MiB 的原始字节加 base64 膨胀必超桥 capBytes 8MiB，先查大小再读，避免做完再失败/OOM
                var size = -1L
                app.contentResolver.query(uri, null, null, null, null)?.use { c ->
                    val idx = c.getColumnIndex(android.provider.OpenableColumns.SIZE)
                    if (idx >= 0 && c.moveToFirst() && !c.isNull(idx)) size = c.getLong(idx)
                }
                if (size > 6_000_000) return@guard """{"ok":false,"error":"image-too-large","hint":"剪贴板图片 >6MB（base64 后超桥 8MiB 上限）"}"""
                val bytes = if (size >= 0) {
                    app.contentResolver.openInputStream(uri)?.use { input ->
                        val buffer = java.io.ByteArrayOutputStream()
                        val chunk = ByteArray(64 * 1024)
                        var total = 0
                        while (true) {
                            val n = input.read(chunk)
                            if (n < 0) break
                            total += n
                            if (total > 6_000_000) return@guard """{"ok":false,"error":"image-too-large","hint":"剪贴板图片 >6MB（base64 后超桥 8MiB 上限）"}"""
                            buffer.write(chunk, 0, n)
                        }
                        buffer.toByteArray()
                    } ?: return@guard """{"ok":false,"error":"clipboard-read-failed"}"""
                } else {
                    app.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                        ?: return@guard """{"ok":false,"error":"clipboard-read-failed"}"""
                }
                val mime = app.contentResolver.getType(uri) ?: "image/png"
                val data = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
                val o = org.json.JSONObject()
                o.put("ok", true)
                o.put("data", data)
                o.put("mime", mime)
                o.put("size", bytes.size)
                o.toString()
            }
        }

        // §6.4 power.keepAwake：{enable:true|false} → AgentKeepAlive dataSync 前台服务（specs/109，P2-5）
        runtime.host.register("power.keepAwake") { args ->
            guard(args) { json ->
                val app = appRef ?: return@guard err("app 未初始化")
                val enable = json.optBoolean("enable", false)
                if (enable) {
                    KeepAliveService.start(app)
                } else {
                    KeepAliveService.stop(app)
                }
                """{"ok":true,"enable":$enable}"""
            }
        }

        // §6.4 fs.pickFiles：SAF ACTION_OPEN_DOCUMENT，两段式（P2-3）；结果拷入 cacheDir 交 Node 可读绝对路径。
        // 顺带执行 T-012 清理契约：上一轮交付的 picked-* 超过 24h 无人认领即回收（后台线程）。
        runtime.host.register("fs.pickFiles") { args ->
            guard(args) { json ->
                val app = appRef ?: return@guard err("app 未初始化")
                val id = PendingSlots.create("pickFiles")
                Thread {
                    runCatching {
                        val cutoff = System.currentTimeMillis() - 24 * 60 * 60_000L
                        app.cacheDir.listFiles { f -> f.name.startsWith("picked-") && f.lastModified() < cutoff }
                            ?.forEach { it.delete() }
                    }
                }.start()
                val intent = android.content.Intent(app, PickDelegateActivity::class.java)
                    .putExtra(PickDelegateActivity.EXTRA_MODE, "pickFiles")
                    .putExtra(PickDelegateActivity.EXTRA_SLOT, id)
                    .putExtra(PickDelegateActivity.EXTRA_MIME, json.optString("mime", "*/*"))
                    .putExtra(PickDelegateActivity.EXTRA_MULTIPLE, json.optBoolean("multiple", false))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                app.startActivity(intent)
                """{"ok":true,"pending":true,"id":"$id"}"""
            }
        }

        // §6.4 fs.saveFile：SAF ACTION_CREATE_DOCUMENT，两段式（P2-3）；data(base64)/text 先暂存，选中目标后写入。
        // base64 解码 + 落盘放后台线程（主线程不做阻塞 IO）；槽位先建、委托页先起（用户浏览目录的时间足够暂存完成）
        runtime.host.register("fs.saveFile") { args ->
            guard(args) { json ->
                val app = appRef ?: return@guard err("app 未初始化")
                val dataB64 = json.optString("data", "")
                val text = json.optString("text", "")
                if (dataB64.isEmpty() && text.isEmpty()) return@guard err("data/text 均为空")
                val id = PendingSlots.create("saveFile")
                val staged = File(app.cacheDir, "save-stage-${System.currentTimeMillis()}.bin")
                Thread {
                    try {
                        val bytes = if (dataB64.isNotEmpty()) {
                            android.util.Base64.decode(dataB64, android.util.Base64.DEFAULT)
                        } else {
                            text.toByteArray(Charsets.UTF_8)
                        }
                        staged.writeBytes(bytes)
                    } catch (t: Throwable) {
                        AppLog.line("warn", "saf", "stage write failed: ${t.javaClass.simpleName}: ${t.message}")
                        HostCapabilities.completeSlot(id, """{"ok":false,"error":"stage-write-failed"}""")
                    }
                }.start()
                val intent = android.content.Intent(app, PickDelegateActivity::class.java)
                    .putExtra(PickDelegateActivity.EXTRA_MODE, "saveFile")
                    .putExtra(PickDelegateActivity.EXTRA_SLOT, id)
                    .putExtra(PickDelegateActivity.EXTRA_MIME, json.optString("mime", "application/octet-stream"))
                    .putExtra(PickDelegateActivity.EXTRA_NAME, json.optString("name", "download.bin"))
                    .putExtra(PickDelegateActivity.EXTRA_STAGED, staged.absolutePath)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                app.startActivity(intent)
                """{"ok":true,"pending":true,"id":"$id"}"""
            }
        }

        runtime.host.register("shutdown") { _ ->
            """{"ok":true,"note":"shutdown 钩子已注册（真正的停止只能是进程退出）"}"""
        }
    }

    /** handler 包装：任何异常 → {"ok":false,"error":…}，绝不向桥抛出。 */
    private inline fun guard(argsJson: String, block: (JSONObject) -> String): String =
        try {
            block(JSONObject(argsJson))
        } catch (t: Throwable) {
            val err = JSONObject()
            err.put("ok", false)
            err.put("error", "${t.javaClass.simpleName}: ${t.message}")
            err.toString()
        }

    private fun facts(app: Application): String {
        val filesDir = app.filesDir
        val o = JSONObject()
        o.put("app", JSONObject().apply {
            put("versionName", BuildConfig.VERSION_NAME)
            put("versionCode", BuildConfig.VERSION_CODE)
            put("applicationId", BuildConfig.APPLICATION_ID)
            put("flavor", BuildConfig.FLAVOR)
        })
        o.put("platform", JSONObject().apply {
            put("sdkInt", Build.VERSION.SDK_INT)
            put("release", Build.VERSION.RELEASE)
            put("abi", Build.SUPPORTED_ABIS.firstOrNull() ?: "unknown")
            put("model", Build.MODEL)
        })
        o.put("paths", JSONObject().apply {
            put("filesDir", filesDir.absolutePath)
            put("dshHome", File(filesDir, Constants.DIR_DSH_HOME).absolutePath)
            put("payloadRoot", File(filesDir, Constants.DIR_PAYLOAD).absolutePath)
            put("workspace", File(filesDir, Constants.DIR_WORKSPACE).absolutePath)
            put("userRoot", Environment.getExternalStorageDirectory().absolutePath)
        })
        o.put("storageMode", BuildConfig.DSH_STORAGE_MODE)
        o.put("foreground", isForeground()) // T-011：notify 前台门的运行时事实
        o.put("ok", true) // FR-CAP-1：所有能力响应统一带 ok 字段
        return o.toString()
    }

    /**
     * image.normalize：base64 输入 → 有界解码（inSampleSize 采样）→ EXIF 纠偏 →
     * fit-inside 缩放（不放大）→ 目标格式压缩 → base64 输出。
     * 纪律：主线程内联执行，用 bounds-first 采样把典型耗时压到秒级；两段式异步属 P2（specs/104）。
     */
    private fun imageNormalize(json: JSONObject): String {
        val dataB64 = json.optString("data", "")
        if (dataB64.isEmpty()) return err("data 为空")
        // 桥 capBytes 默认 8 MiB（NodeRuntimeOptions）；留出信封余量，输入 base64 上限 8 MB（原始约 6 MB）。
        // 更大图片与异步预算（>10s）走 P2 两段式（specs/104）。
        if (dataB64.length > 8_000_000) return err("图片过大（base64 ${dataB64.length} > 8_000_000）")
        val input = try {
            android.util.Base64.decode(dataB64, android.util.Base64.DEFAULT)
        } catch (t: Throwable) {
            return err("base64 解码失败：${t.message}")
        }
        val format = json.optString("format", "jpeg").lowercase()
        val quality = json.optInt("quality", 85).coerceIn(1, 100)
        val targetW = if (json.has("width") && json.optInt("width") > 0) json.optInt("width") else Int.MAX_VALUE
        val targetH = if (json.has("height") && json.optInt("height") > 0) json.optInt("height") else Int.MAX_VALUE
        val withoutEnlargement = json.optBoolean("withoutEnlargement", true)
        val extraRotate = json.optBoolean("rotate", false)

        // ① bounds 采样
        val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
        android.graphics.BitmapFactory.decodeByteArray(input, 0, input.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return err("无法解码图片（w=${bounds.outWidth},h=${bounds.outHeight}）")
        val sample = android.graphics.BitmapFactory.Options().apply {
            inSampleSize = computeInSampleSize(bounds.outWidth, bounds.outHeight, targetW, targetH)
            inPreferredConfig = android.graphics.Bitmap.Config.ARGB_8888
        }
        var bitmap = android.graphics.BitmapFactory.decodeByteArray(input, 0, input.size, sample)
            ?: return err("解码失败")

        // ② EXIF 纠偏（JPEG）
        if (bounds.outMimeType?.contains("jpeg") == true) {
            val exif = runCatching { android.media.ExifInterface(java.io.ByteArrayInputStream(input)) }.getOrNull()
            val orientation = exif?.getAttributeInt(
                android.media.ExifInterface.TAG_ORIENTATION,
                android.media.ExifInterface.ORIENTATION_NORMAL,
            ) ?: android.media.ExifInterface.ORIENTATION_NORMAL
            val degrees = when (orientation) {
                android.media.ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                android.media.ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                android.media.ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
            if (degrees != 0f) {
                val m = android.graphics.Matrix().apply { postRotate(degrees) }
                val rotated = android.graphics.Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, m, true)
                if (rotated != bitmap) bitmap.recycle()
                bitmap = rotated
            }
        }
        // 显式 rotate 请求（sharp 语义：顺时针 90°）
        if (extraRotate) {
            val m = android.graphics.Matrix().apply { postRotate(90f) }
            val rotated = android.graphics.Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, m, true)
            if (rotated != bitmap) bitmap.recycle()
            bitmap = rotated
        }

        // ③ fit-inside 缩放（不放大）
        val w = bitmap.width
        val h = bitmap.height
        val ratio = minOf(
            if (targetW != Int.MAX_VALUE) targetW.toFloat() / w else Float.POSITIVE_INFINITY,
            if (targetH != Int.MAX_VALUE) targetH.toFloat() / h else Float.POSITIVE_INFINITY,
        )
        val scale = if (withoutEnlargement) minOf(1f, ratio) else if (ratio.isFinite()) ratio else 1f
        if (scale < 0.999f) {
            val scaled = android.graphics.Bitmap.createScaledBitmap(
                bitmap,
                Math.max(1, Math.round(w * scale)),
                Math.max(1, Math.round(h * scale)),
                true,
            )
            if (scaled != bitmap) bitmap.recycle()
            bitmap = scaled
        }

        // ④ 压缩
        val compressFormat = when (format) {
            "png" -> android.graphics.Bitmap.CompressFormat.PNG
            "webp" -> if (Build.VERSION.SDK_INT >= 30) android.graphics.Bitmap.CompressFormat.WEBP_LOSSY else android.graphics.Bitmap.CompressFormat.WEBP
            else -> android.graphics.Bitmap.CompressFormat.JPEG
        }
        val out = java.io.ByteArrayOutputStream()
        val ok = bitmap.compress(compressFormat, quality, out)
        val outW = bitmap.width
        val outH = bitmap.height
        bitmap.recycle()
        if (!ok) return err("压缩失败（format=$format）")

        val o = JSONObject()
        o.put("ok", true)
        o.put("data", android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP))
        o.put("format", format)
        o.put("width", outW)
        o.put("height", outH)
        return o.toString()
    }

    private fun computeInSampleSize(width: Int, height: Int, targetW: Int, targetH: Int): Int {
        var sample = 1
        if (width <= 0 || height <= 0) return 1
        val halfW = width / 2
        val halfH = height / 2
        val limitW = if (targetW == Int.MAX_VALUE) width else targetW
        val limitH = if (targetH == Int.MAX_VALUE) height else targetH
        while (halfW / sample >= limitW && halfH / sample >= limitH) {
            sample *= 2
        }
        return sample
    }

    private fun notifyShow(json: JSONObject): String {
        val app = appRef ?: return err("app 未初始化")
        if (Build.VERSION.SDK_INT >= 33) {
            val nm = app.getSystemService(NotificationManager::class.java)
            if (nm?.areNotificationsEnabled() != true) {
                val o = JSONObject()
                o.put("ok", false)
                o.put("error", "notification-permission-missing")
                o.put("hint", "请在系统设置中允许通知（POST_NOTIFICATIONS）")
                return o.toString()
            }
        }
        val channel = NotificationChannel(NOTIFY_CHANNEL, "DSH 事件", NotificationManager.IMPORTANCE_DEFAULT).also {
            app.getSystemService(NotificationManager::class.java)?.createNotificationChannel(it)
        }
        val launch = app.packageManager.getLaunchIntentForPackage(app.packageName)
        val pi = PendingIntent.getActivity(app, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val title = json.optString("title", "DSH")
        // JS 侧（notify-android）发的是 body；兼容历史 text 字段
        val text = if (json.has("body")) json.optString("body", "") else json.optString("text", "")
        val notification = Notification.Builder(app, NOTIFY_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build()
        val nm = app.getSystemService(NotificationManager::class.java) ?: return err("NotificationManager 不可用")
        nm.notify(json.optInt("id", 1001), notification)
        AppLog.line("info", "notify", "shown: $title")
        return """{"ok":true}"""
    }

    private fun err(message: String, hint: String? = null): String {
        val o = JSONObject()
        o.put("ok", false)
        o.put("error", message)
        if (hint != null) o.put("hint", hint)
        return o.toString()
    }

    private fun probeAllFiles(): String {
        val o = JSONObject()
        val sdkInt = Build.VERSION.SDK_INT
        o.put("sdkInt", sdkInt)
        val granted = Build.VERSION.SDK_INT >= 30 && Environment.isExternalStorageManager()
        o.put("granted", granted)
        o.put("userRoot", Environment.getExternalStorageDirectory().absolutePath)
        val tried = JSONObject()
        for (name in listOf("Documents", "Download")) {
            val dir = File(Environment.getExternalStorageDirectory(), name)
            val r = JSONObject()
            try {
                r.put("exists", dir.exists())
                r.put("listable", dir.isDirectory && dir.list() != null)
                val probe = File(dir, ".dsh-probe-${System.currentTimeMillis()}.txt")
                probe.writeText("dsh-android-probe")
                val readBack = probe.readText() == "dsh-android-probe"
                probe.delete()
                r.put("writable", readBack)
            } catch (t: Throwable) {
                r.put("error", "${t.javaClass.simpleName}: ${t.message}")
            }
            tried.put(name, r)
        }
        o.put("dirs", tried)
        return o.toString()
    }
}
