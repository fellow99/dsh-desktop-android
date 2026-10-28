package org.fellow99.dsh.android.host

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import org.fellow99.dsh.android.common.AppLog
import java.io.File
import org.json.JSONObject

/**
 * SAF 两段式委托页（specs/103 文件选择与下载 / 冻结名 fs.pickFiles·fs.saveFile）。
 *
 * 流程（§6.4 两段式，perm.request 同款）：
 * 1. `HostCapabilities.fs.pickFiles|fs.saveFile` 创建槽位 → 以 `startActivity` 拉起本页
 *    （extras 携带 mode + slotId）→ 对桥立即返回 `{ok,pending,id}`；
 * 2. 本页发 ACTION_OPEN_DOCUMENT / ACTION_CREATE_DOCUMENT（仅 savedInstanceState==null 时发起，
 *    避免旋转/恢复重建时叠出第二个选择器）；
 * 3. onActivityResult 解析：pickFiles 把所选 content 拷入 cacheDir（Node 可读的绝对路径）
 *    → `completeSlot(id, json)`；saveFile 把暂存字节写到目标 uri → 完成；
 *    IO 一律在后台线程（主线程不做阻塞 IO；单文件拷贝上限 64MB）；
 * 4. 用户取消 → `{cancelled:true}`；异常 → `{ok:false,error}`；槽位绝不悬挂
 *    （15 分钟 TTL 兜底在 PendingSlots，kind 级放宽）。
 *
 * 纪律：本页 transparent + excludeFromRecents；除启动 intent 外不做任何 UI。
 */
class PickDelegateActivity : Activity() {

    companion object {
        const val EXTRA_MODE = "mode"           // "pickFiles" | "saveFile"
        const val EXTRA_SLOT = "slot"           // PendingSlots 槽位 id
        const val EXTRA_NAME = "name"           // saveFile 建议文件名
        const val EXTRA_MIME = "mime"           // saveFile/pickFiles 的 MIME
        const val EXTRA_STAGED = "staged"       // saveFile 暂存文件绝对路径
        const val EXTRA_MULTIPLE = "multiple"   // pickFiles 是否多选
        /** 单文件拷贝上限（SAF 选大视频防主线程/内存失控；超限该文件记失败）。 */
        private const val MAX_STAGE_BYTES = 64L * 1024 * 1024
        private const val REQ_PICK = 4101
        private const val REQ_SAVE = 4102
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState != null) {
            // 重建（旋转/深色切换/进程恢复）：不重复发起 intent，等待原实例的结果或槽位 TTL 兜底
            finish()
            return
        }
        val mode = intent?.getStringExtra(EXTRA_MODE) ?: return finish()
        val slot = intent?.getStringExtra(EXTRA_SLOT) ?: return finish()
        try {
            when (mode) {
                "pickFiles" -> {
                    val mime = intent.getStringExtra(EXTRA_MIME) ?: "*/*"
                    val it = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        setType(mime)
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, intent.getBooleanExtra(EXTRA_MULTIPLE, false))
                    }
                    startActivityForResult(it, REQ_PICK)
                }
                "saveFile" -> {
                    val it = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        setType(intent.getStringExtra(EXTRA_MIME) ?: "application/octet-stream")
                        putExtra(Intent.EXTRA_TITLE, intent.getStringExtra(EXTRA_NAME) ?: "download.bin")
                    }
                    startActivityForResult(it, REQ_SAVE)
                }
                else -> finish()
            }
        } catch (t: Throwable) {
            AppLog.line("warn", "saf", "launch failed: ${t.javaClass.simpleName}: ${t.message}")
            HostCapabilities.completeSlot(slot, """{"ok":false,"error":"saf-launch-failed"}""")
            finish()
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val slot = intent?.getStringExtra(EXTRA_SLOT) ?: return finish()
        val mode = intent?.getStringExtra(EXTRA_MODE) ?: return finish()
        // 解析 + IO 全在后台线程；本页随即 finish（槽位经 completeSlot 异步收口）
        val snapshots = collectUris(requestCode, resultCode, data)
        val stagedPath = intent.getStringExtra(EXTRA_STAGED) ?: ""
        Thread {
            try {
                when (requestCode) {
                    REQ_PICK -> {
                        if (snapshots.first == null) {
                            HostCapabilities.completeSlot(slot, """{"ok":true,"cancelled":true,"files":[]}""")
                            return@Thread
                        }
                        val files = mutableListOf<String>()
                        var failed = 0
                        for (uri in snapshots.first!!) {
                            val staged = stageContent(uri)
                            if (staged == null) failed += 1 else files.add(staged)
                        }
                        val arr = files.joinToString(",") { f ->
                            val file = File(f)
                            """{"path":${JSONObject.quote(f)},"name":${JSONObject.quote(file.name)},"size":${file.length()}}"""
                        }
                        HostCapabilities.completeSlot(
                            slot,
                            """{"ok":true,"cancelled":false,"files":[$arr],"failed":$failed}""",
                        )
                    }
                    REQ_SAVE -> {
                        val target = snapshots.second
                        if (target == null) {
                            File(stagedPath).delete()
                            HostCapabilities.completeSlot(slot, """{"ok":true,"cancelled":true}""")
                            return@Thread
                        }
                        try {
                            val bytes = if (stagedPath != "") File(stagedPath).readBytes() else ByteArray(0)
                            contentResolver.openOutputStream(target)?.use { it.write(bytes) }
                                ?: throw IllegalStateException("openOutputStream returned null")
                            HostCapabilities.completeSlot(
                                slot,
                                """{"ok":true,"cancelled":false,"uri":${JSONObject.quote(target.toString())},"size":${bytes.size}}""",
                            )
                        } finally {
                            File(stagedPath).delete()
                        }
                    }
                }
            } catch (t: Throwable) {
                AppLog.line("warn", "saf", "resolve failed: ${t.javaClass.simpleName}: ${t.message}")
                File(stagedPath).delete()
                HostCapabilities.completeSlot(slot, """{"ok":false,"error":"${t.javaClass.simpleName}: ${t.message}"}""")
            }
        }.start()
        finish()
    }

    /** 主线程内只做 uri 快照（不读内容），返回 (pickUris, saveTarget)。 */
    private fun collectUris(requestCode: Int, resultCode: Int, data: Intent?): Pair<List<Uri>?, Uri?> {
        if (resultCode != RESULT_OK || data == null) return null to null
        return when (requestCode) {
            REQ_PICK -> {
                val uris = mutableListOf<Uri>()
                val clip = data.clipData
                if (clip != null) {
                    for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri)
                } else {
                    data.data?.let(uris::add)
                }
                uris to null
            }
            REQ_SAVE -> null to data.data
            else -> null to null
        }
    }

    /** 把 content uri 拷入 cacheDir（≤64MB），返回可交给 Node fs 的绝对路径（失败/超限返回 null）。 */
    private fun stageContent(uri: Uri): String? {
        return try {
            val name = (contentResolver.query(uri, null, null, null, null)?.use { c ->
                val idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (idx >= 0 && c.moveToFirst()) c.getString(idx) else null
            } ?: "picked.bin").ifBlank { "picked.bin" }
            val safe = name.replace(Regex("[/\\\\]"), "_")
            val out = File(cacheDir, "picked-${System.currentTimeMillis()}-$safe")
            var copied = 0L
            contentResolver.openInputStream(uri)?.use { input ->
                out.outputStream().use { output ->
                    val chunk = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(chunk)
                        if (n < 0) break
                        copied += n
                        if (copied > MAX_STAGE_BYTES) {
                            out.delete()
                            AppLog.line("warn", "saf", "stage too large (>64MB): $name")
                            return null
                        }
                        output.write(chunk, 0, n)
                    }
                }
            } ?: return null
            out.absolutePath
        } catch (t: Throwable) {
            AppLog.line("warn", "saf", "stage failed: ${t.javaClass.simpleName}: ${t.message}")
            null
        }
    }
}
