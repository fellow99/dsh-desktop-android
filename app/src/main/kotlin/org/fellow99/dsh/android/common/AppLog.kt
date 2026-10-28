package org.fellow99.dsh.android.common

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.File

/**
 * 业务日志（§6.7 第二通道）：`<filesDir>/dsh-home/logs/app.log`，结构化单行 JSON。
 * Node 的 stdout/stderr 由桥重建到 node_bridge.log，两者不可混用（R4）。
 */
object AppLog {
    @Volatile
    private var logFile: File? = null

    fun init(ctx: Context) {
        if (logFile == null) {
            synchronized(this) {
                if (logFile == null) {
                    val dir = File(ctx.filesDir, "${Constants.DIR_DSH_HOME}/${Constants.DIR_LOGS}")
                    dir.mkdirs()
                    logFile = File(dir, "app.log")
                }
            }
        }
    }

    fun line(level: String, tag: String, msg: String) {
        val f = logFile
        rotateIfNeeded(f)
        val entry = JSONObject()
        entry.put("at", System.currentTimeMillis())
        entry.put("level", level)
        entry.put("tag", tag)
        entry.put("msg", msg)
        val text = entry.toString()
        synchronized(this) {
            try {
                f?.appendText(text + "\n")
            } catch (_: Throwable) {
                // 日志写失败不吞业务
            }
        }
        Log.println(priorityOf(level), Constants.APP_LOG_TAG, "$tag: $msg")
    }

    fun tail(maxLines: Int): List<String> {
        val f = logFile ?: return emptyList()
        return try {
            f.readLines().takeLast(maxLines)
        } catch (_: Throwable) {
            emptyList()
        }
    }

    private fun priorityOf(level: String): Int = when (level) {
        "error" -> Log.ERROR
        "warn" -> Log.WARN
        "info" -> Log.INFO
        "debug" -> Log.DEBUG
        else -> Log.INFO
    }

    /** 简单轮转：>2MB 时 app.log → app.log.1（只留一代），防止无界增长（评审 I13）。 */
    private fun rotateIfNeeded(f: File?) {
        if (f == null || !f.isFile) return
        runCatching {
            if (f.length() > 2L * 1024 * 1024) {
                val prev = File(f.parentFile, "app.log.1")
                prev.delete()
                f.renameTo(prev)
            }
        }
    }
}
