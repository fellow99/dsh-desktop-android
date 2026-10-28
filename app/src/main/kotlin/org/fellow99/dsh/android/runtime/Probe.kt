package org.fellow99.dsh.android.runtime

import java.net.HttpURLConnection
import java.net.URL

/**
 * 就绪探活（§4.6）：HEAD / 必须返回 200/303/401 之一（服务在听即算，页面鉴权不归壳管）。
 */
object Probe {

    data class Result(val ok: Boolean, val httpCode: Int, val attempts: Int, val error: String?)

    private val acceptable = setOf(200, 303, 401)

    fun head(origin: String, retries: Int, intervalMs: Long): Result {
        var lastError: String? = null
        for (attempt in 1..retries) {
            try {
                val conn = (URL(origin).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 2_000
                    readTimeout = 3_000
                    requestMethod = "HEAD"
                    instanceFollowRedirects = false
                }
                val code = try {
                    conn.responseCode
                } finally {
                    conn.disconnect()
                }
                if (code in acceptable) {
                    return Result(true, code, attempt, null)
                }
                lastError = "HTTP $code"
            } catch (t: Throwable) {
                lastError = "${t.javaClass.simpleName}: ${t.message}"
            }
            if (attempt < retries) {
                try {
                    Thread.sleep(intervalMs)
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    break
                }
            }
        }
        return Result(false, 0, retries, lastError)
    }
}
