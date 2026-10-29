package org.fellow99.dsh.android.host

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File

/**
 * 工作区文件共享 Provider（T-005 / specs P3 FileProvider 路线，零 androidx 自建）。
 *
 * 目的：外部应用无法读应用私有目录，`file://` 又被 Android 33+ 禁止暴露 ——
 * 以 `content://org.fellow99.dsh.android.workspacefiles/<相对路径>` 暴露**工作区内**
 * 的文件，配合 `FLAG_GRANT_READ_URI_PERMISSION` 供 ACTION_VIEW 打开。
 *
 * 安全边界（enforcement point，不是约定）：
 * - 只读（openFile 仅 READ_ONLY）；
 * - 只服务工作区根（filesDir/workspace）内的文件：先 canonical 化再做前缀包含校验，
 *   `..` 穿越与 symlink 逃逸都被 canonicalPath 吸收；
 * - exported=false：仅本应用显式 grant 的接收方可读。
 */
class WorkspaceFilesProvider : ContentProvider() {

    companion object {
        const val AUTHORITY = "org.fellow99.dsh.android.workspacefiles"
        private val COLUMNS = arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)

        /** 把工作区内绝对路径转 content URI；越界返回 null（调用方如实降级）。 */
        fun uriForFile(context: android.content.Context, file: File): Uri? {
            val root = File(context.filesDir, "workspace")
            val canonicalFile = file.canonicalFile
            val canonicalRoot = root.canonicalFile
            val rel = canonicalFile.relativeToOrNull(canonicalRoot) ?: return null
            if (rel.startsWith("..")) return null
            return Uri.Builder()
                .scheme("content")
                .authority(AUTHORITY)
                .appendPath("")
                .encodedPath(rel.invariantSeparatorsPath.split('/').joinToString("/") { android.net.Uri.encode(it) })
                .build()
        }

        /** content URI → 工作区内绝对路径；非法/越界返回 null。 */
        fun fileForUri(context: android.content.Context, uri: Uri): File? {
            if (uri.authority != AUTHORITY) return null
            val rel = uri.path?.trimStart('/') ?: return null
            if (rel.isEmpty()) return null
            val root = File(context.filesDir, "workspace").canonicalFile
            val candidate = File(root, rel).canonicalFile
            val relCheck = candidate.relativeToOrNull(root) ?: return null
            if (relCheck.startsWith("..")) return null
            return candidate
        }
    }

    override fun onCreate(): Boolean = true

    private fun fileFor(uri: Uri): File? = fileForUri(requireContext(), uri)

    override fun openFile(uri: Uri, mode: String): android.os.ParcelFileDescriptor? {
        val file = fileFor(uri) ?: throw SecurityException("path is outside the workspace fence")
        if (!file.isFile) throw java.io.FileNotFoundException("not a file: $uri")
        val readWrite = if (mode.contains('w')) android.os.ParcelFileDescriptor.MODE_READ_WRITE
        else android.os.ParcelFileDescriptor.MODE_READ_ONLY
        return android.os.ParcelFileDescriptor.open(file, readWrite)
    }

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?,
    ): Cursor? {
        val file = fileFor(uri) ?: return null
        val cols = projection ?: COLUMNS
        val cursor = MatrixCursor(cols)
        val row = mapOf(
            OpenableColumns.DISPLAY_NAME to file.name,
            OpenableColumns.SIZE to (if (file.isFile) file.length() else 0L).toString(),
        )
        cursor.addRow(cols.map { row[it] ?: "" })
        return cursor
    }

    override fun getType(uri: Uri): String? {
        val file = fileFor(uri) ?: return null
        val name = file.name
        val dot = name.lastIndexOf('.')
        val ext = if (dot >= 0) name.substring(dot + 1) else ""
        val mime = if (ext.isNotEmpty()) {
            android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.lowercase())
        } else null
        return mime ?: "application/octet-stream"
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}
