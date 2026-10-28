package org.fellow99.dsh.android.host

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import org.fellow99.dsh.android.common.AppLog
import java.io.File

/**
 * SAF 两段式委托页（specs/103 文件选择与下载 / 冻结名 fs.pickFiles·fs.saveFile）。
 *
 * 流程（§6.4 两段式，perm.request 同款）：
 * 1. `HostCapabilities.fs.pickFiles|fs.saveFile` 创建槽位 → 以 `startActivity` 拉起本页
 *    （extras 携带 mode + slotId）→ 对桥立即返回 `{ok,pending,id}`；
 * 2. 本页发 ACTION_OPEN_DOCUMENT / ACTION_CREATE_DOCUMENT；
 * 3. onActivityResult 解析：pickFiles 把所选 content 拷入 cacheDir（Node 可读的绝对路径）
 *    → `completeSlot(id, json)`；saveFile 把暂存字节写到目标 uri → 完成；
 * 4. 用户取消 → `{cancelled:true}`；崩溃/异常 → `{ok:false,error}`，槽位绝不悬挂
 *    （5 分钟过期兜底在 PendingSlots）。
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
        private const val REQ_PICK = 4101
        private const val REQ_SAVE = 4102
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
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
        try {
            when (requestCode) {
                REQ_PICK -> {
                    if (resultCode != RESULT_OK || data == null) {
                        HostCapabilities.completeSlot(slot, """{"ok":true,"cancelled":true,"files":[]}""")
                        return finish()
                    }
                    val files = mutableListOf<String>()
                    val uris = mutableListOf<Uri>()
                    val clip = data.clipData
                    if (clip != null) {
                        for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri)
                    } else {
                        data.data?.let(uris::add)
                    }
                    for (uri in uris) {
                        val staged = stageContent(uri) ?: continue
                        files.add(staged)
                    }
                    val arr = files.joinToString(",") { f ->
                        val file = File(f)
                        """{"path":${org.json.JSONObject.quote(f)},"name":${org.json.JSONObject.quote(file.name)},"size":${file.length()}}"""
                    }
                    HostCapabilities.completeSlot(slot, """{"ok":true,"cancelled":false,"files":[$arr]}""")
                }
                REQ_SAVE -> {
                    val target = data?.data
                    if (resultCode != RESULT_OK || target == null) {
                        HostCapabilities.completeSlot(slot, """{"ok":true,"cancelled":true}""")
                        return finish()
                    }
                    val stagedPath = intent.getStringExtra(EXTRA_STAGED) ?: ""
                    val bytes = if (stagedPath != "") File(stagedPath).readBytes() else ByteArray(0)
                    contentResolver.openOutputStream(target)?.use { it.write(bytes) }
                        ?: throw IllegalStateException("openOutputStream returned null")
                    File(stagedPath).delete()
                    HostCapabilities.completeSlot(
                        slot,
                        """{"ok":true,"cancelled":false,"uri":${org.json.JSONObject.quote(target.toString())},"size":${bytes.size}}""",
                    )
                }
            }
        } catch (t: Throwable) {
            AppLog.line("warn", "saf", "resolve failed: ${t.javaClass.simpleName}: ${t.message}")
            HostCapabilities.completeSlot(slot, """{"ok":false,"error":"${t.javaClass.simpleName}: ${t.message}"}""")
        } finally {
            finish()
        }
    }

    /** 把 content uri 拷入 cacheDir，返回可交给 Node fs 的绝对路径（失败返回 null）。 */
    private fun stageContent(uri: Uri): String? {
        return try {
            val name = (contentResolver.query(uri, null, null, null, null)?.use { c ->
                val idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (idx >= 0 && c.moveToFirst()) c.getString(idx) else null
            } ?: "picked.bin").ifBlank { "picked.bin" }
            val safe = name.replace(Regex("[/\\\\]"), "_")
            val out = File(cacheDir, "picked-${System.currentTimeMillis()}-$safe")
            contentResolver.openInputStream(uri)?.use { input -> out.outputStream().use { input.copyTo(it) } }
                ?: return null
            out.absolutePath
        } catch (t: Throwable) {
            AppLog.line("warn", "saf", "stage failed: ${t.javaClass.simpleName}: ${t.message}")
            null
        }
    }
}
