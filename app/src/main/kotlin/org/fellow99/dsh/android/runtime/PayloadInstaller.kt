package org.fellow99.dsh.android.runtime

import android.app.Application
import org.fellow99.dsh.android.common.AppLog
import org.fellow99.dsh.android.common.Constants
import java.io.BufferedInputStream
import java.io.File
import java.security.DigestInputStream
import java.security.MessageDigest

/**
 * 载荷解包（§7.4）：assets/dsh-payload/dsh.tar → `<filesDir>/payload/<sha12>/`。
 *
 * - 资产为**裸 ustar**（AAPT2 会解压 *.gz 并改名，故不用 .gz；zip 容器本身已压缩）；
 * - 幂等 marker：`<target>/.ready-<sha12>` 命中即跳过；
 * - 先解到 `<payload>/.tmp-<pid>`，完成后 rename（同分区原子）；
 * - SHA-256 在解包流上同步计算，结束与 dsh.version 对账，不符即删半包；
 * - 安全：拒绝绝对路径 / `..` / 非常规类型条目（zip-slip）；单文件与总量上限；
 * - assets 不是文件系统路径（A1）：一切经 AssetManager 流式读。
 */
object PayloadInstaller {

    data class Result(val dir: File, val sha12: String, val reused: Boolean, val files: Int, val bytes: Long)

    class InstallException(message: String, cause: Throwable? = null) : Exception(message, cause)

    private const val MAX_FILE_BYTES = 512L * 1024 * 1024
    private const val MAX_TOTAL_BYTES = 800L * 1024 * 1024

    fun payloadRoot(app: Application): File = File(app.filesDir, Constants.DIR_PAYLOAD)

    fun versionFile(app: Application): String = runCatching {
        app.assets.open(Constants.ASSET_VERSION).bufferedReader().use { it.readText() }
    }.getOrDefault("")

    fun expectedSha256(app: Application): String =
        versionFile(app).lineSequence().firstOrNull { it.startsWith("sha256=") }
            ?.removePrefix("sha256=")?.trim().orEmpty()

    fun install(app: Application): Result {
        val t0 = System.currentTimeMillis()
        val expected = expectedSha256(app)
        if (expected.length < 12) {
            throw InstallException("dsh.version 缺少 sha256 行（assets 未打包或损坏）")
        }
        val sha12 = expected.take(12)
        val root = payloadRoot(app)
        root.mkdirs()
        val target = File(root, sha12)
        val marker = File(target, "${Constants.MARKER_PREFIX}$sha12")

        if (marker.isFile && File(target, "bootstrap.js").isFile) {
            AppLog.line("info", "payload", "marker 命中，跳过解包 sha12=$sha12")
            return Result(target, sha12, reused = true, files = -1, bytes = -1)
        }

        // 上一代际保留（§8.5 回滚位）
        val previous = File(root, Constants.DIR_PREVIOUS)
        if (target.isDirectory) {
            previous.deleteRecursively()
            if (!target.renameTo(previous)) {
                AppLog.line("warn", "payload", "旧代际改名失败，直接删除 ${target.name}")
                target.deleteRecursively()
            }
        }

        val tmp = File(root, ".tmp-${android.os.Process.myPid()}")
        tmp.deleteRecursively()
        tmp.mkdirs()

        var files = 0
        var totalBytes = 0L
        try {
            val md = MessageDigest.getInstance("SHA-256")
            app.assets.open(Constants.ASSET_PAYLOAD).use { raw ->
                // 资产是裸 ustar（AAPT2 会解压 *.gz 并改名，见 Constants.ASSET_PAYLOAD 注释）
                DigestInputStream(BufferedInputStream(raw, 256 * 1024), md).use { digestStream ->
                    TarReader(digestStream).use { tar ->
                        while (true) {
                            val entry = tar.nextEntry() ?: break
                            val outFile = safeTarget(tmp, entry.name)
                            when (entry.type) {
                                TarReader.TYPE_DIR -> outFile.mkdirs()
                                TarReader.TYPE_FILE -> {
                                    outFile.parentFile?.mkdirs()
                                    tar.copyDataTo(outFile, MAX_FILE_BYTES) { n ->
                                        totalBytes += n
                                        if (totalBytes > MAX_TOTAL_BYTES) {
                                            throw InstallException("载荷总量超上限：$totalBytes")
                                        }
                                    }
                                    files++
                                }
                                else -> throw InstallException(
                                    "不支持的 tar 条目类型 '${entry.type}'（name=${entry.name}）"
                                )
                            }
                        }
                    }
                }
            }
            val actual = md.digest().joinToString("") { "%02x".format(it) }
            if (!actual.equals(expected, ignoreCase = true)) {
                throw InstallException("载荷 SHA-256 对账失败：expected=$expected actual=$actual")
            }
        } catch (e: Throwable) {
            tmp.deleteRecursively()
            throw e
        }

        if (!tmp.renameTo(target)) {
            tmp.deleteRecursively()
            throw InstallException("payload rename 失败（同分区？）：${tmp.path} → ${target.path}")
        }
        marker.createNewFile()
        // 版本文件随解包产物落盘（正式 bootstrap.js 读取 sha12 登记；权威校验已在本流程完成）
        runCatching {
            File(target, "dsh.version").writeText(versionFile(app))
        }
        val ms = System.currentTimeMillis() - t0
        AppLog.line("info", "payload", "解包完成 sha12=$sha12 files=$files bytes=$totalBytes ms=$ms")
        return Result(target, sha12, reused = false, files = files, bytes = totalBytes)
    }

    /** 启动成功后清理：只保留当前代际与 previous（§7.4）。 */
    fun cleanupStale(app: Application, keepSha12: String) {
        val root = payloadRoot(app)
        root.listFiles()?.forEach { child ->
            if (child.name != keepSha12 && child.name != Constants.DIR_PREVIOUS) {
                child.deleteRecursively()
                AppLog.line("info", "payload", "清理旧代际 ${child.name}")
            }
        }
    }

    private fun safeTarget(base: File, rawName: String): File {
        if (rawName.isEmpty()) throw InstallException("空条目名")
        if (rawName.startsWith("/") || rawName.contains("\\") || rawName.contains(":")) {
            throw InstallException("非法条目路径：$rawName")
        }
        val parts = rawName.split('/').filter { it.isNotEmpty() }
        if (parts.any { it == ".." }) throw InstallException("条目越界（..）：$rawName")
        return File(base, parts.joinToString(File.separator))
    }
}

/**
 * 最小 ustar 读取器：只认本工程 package-payload.mjs 写出的形态（无 pax / 无 GNU longname）。
 * 语义：nextEntry() 返回条目头；copyDataTo() 写出 size 字节后自动跳过 512 对齐填充。
 */
internal class TarReader(private val input: java.io.InputStream) : AutoCloseable {

    data class Entry(val name: String, val size: Long, val type: Byte)

    private val header = ByteArray(512)
    private var dataLeft = 0L
    private var padLeft = 0L
    private var lastBlockWasZero = false

    fun nextEntry(): Entry? {
        // 上一条目的填充必须已消费
        check(dataLeft == 0L) { "上一条目数据未读完（$dataLeft 字节）" }
        skipFully(padLeft)
        padLeft = 0
        while (true) {
            if (!readFully(header)) return null
            val allZero = header.all { it == 0.toByte() }
            if (allZero) {
                if (lastBlockWasZero) return null
                lastBlockWasZero = true
                continue
            }
            lastBlockWasZero = false
            val nameRaw = field(0, 100)
            val prefixRaw = field(345, 155)
            val name = if (prefixRaw.isEmpty()) nameRaw else "$prefixRaw/$nameRaw"
            val size = octal(124, 12) ?: 0L
            val type = header[156]
            val magic = field(257, 6)
            if (magic.isNotEmpty() && !magic.startsWith("ustar")) {
                throw PayloadInstaller.InstallException("非 ustar 归档（magic=$magic）")
            }
            if (size < 0) throw PayloadInstaller.InstallException("条目大小为负（$name）")
            val padded = (size + 511) / 512 * 512
            when (type) {
                TYPE_FILE, TYPE_DIR -> {
                    dataLeft = if (type == TYPE_FILE) size else 0L
                    padLeft = padded - dataLeft
                    return Entry(name.trimEnd('/'), size, type)
                }
                else -> throw PayloadInstaller.InstallException(
                    "不支持的 tar 条目类型 '$type'（name=$name）——契约禁止 pax/GNU 扩展"
                )
            }
        }
    }

    fun copyDataTo(outFile: File, maxFileBytes: Long, onChunk: (Int) -> Unit) {
        if (dataLeft > maxFileBytes) {
            throw PayloadInstaller.InstallException("单文件超上限：${outFile.name}（$dataLeft）")
        }
        val buf = ByteArray(64 * 1024)
        var left = dataLeft
        outFile.outputStream().use { out ->
            while (left > 0) {
                val want = minOf(buf.size.toLong(), left).toInt()
                val n = input.read(buf, 0, want)
                if (n < 0) throw PayloadInstaller.InstallException("归档数据截断：${outFile.name}")
                out.write(buf, 0, n)
                onChunk(n)
                left -= n
            }
        }
        dataLeft = 0
    }

    override fun close() = input.close()

    private fun field(off: Int, len: Int): String {
        var end = off
        val max = off + len
        while (end < max && header[end] != 0.toByte()) end++
        return String(header, off, end - off, Charsets.UTF_8).trim()
    }

    private fun octal(off: Int, len: Int): Long? {
        val s = field(off, len).trim(' ', '\u0000').takeWhile { it in '0'..'7' }
        return if (s.isEmpty()) null else s.toLong(8)
    }

    private fun readFully(buf: ByteArray): Boolean {
        var off = 0
        while (off < buf.size) {
            val n = input.read(buf, off, buf.size - off)
            if (n < 0) return off == 0 // 流在块边界结束
            off += n
        }
        return true
    }

    private fun skipFully(n0: Long) {
        var left = n0
        val buf = ByteArray(64 * 1024)
        while (left > 0) {
            val want = minOf(buf.size.toLong(), left).toInt()
            val n = input.read(buf, 0, want)
            if (n < 0) return
            left -= n
        }
    }

    companion object {
        const val TYPE_FILE: Byte = '0'.code.toByte()
        const val TYPE_DIR: Byte = '5'.code.toByte()
    }
}
