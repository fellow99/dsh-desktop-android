package org.fellow99.dsh.android.ui

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.view.Gravity
import android.view.View
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import org.fellow99.dsh.android.BuildConfig
import org.fellow99.dsh.android.common.AppLog
import org.fellow99.dsh.android.common.Constants

/**
 * WebShellView（§6.3 配置矩阵逐项落实）：
 * WebView + 加载覆盖层 + 错误/诊断覆盖层；导航围栏只放行本机 origin；渲染进程崩溃自愈（A6）。
 */
class WebShellView(context: Context) : FrameLayout(context) {

    private var webView: WebView? = null
    private var originPort: Int = -1
    private var lastUrl: String? = null
    private var historyCleared = false

    private val loadingStatus: TextView
    private val loadingOverlay: LinearLayout
    private val errorText: TextView
    private val errorOverlay: ScrollView

    init {
        setBackgroundColor(Color.parseColor("#0F1115"))

        loadingOverlay = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            visibility = VISIBLE
            addView(ProgressBar(context))
            loadingStatus = TextView(context).apply {
                setTextColor(Color.parseColor("#9AA0A6"))
                setPadding(24, 24, 24, 24)
                gravity = Gravity.CENTER
                text = "正在启动…"
            }
            addView(loadingStatus)
        }
        addView(loadingOverlay, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))

        errorText = TextView(context).apply {
            setTextColor(Color.parseColor("#FF6B6B"))
            textSize = 12f
            typeface = android.graphics.Typeface.MONOSPACE
            setPadding(24, 24, 24, 24)
            setTextIsSelectable(true)
        }
        errorOverlay = ScrollView(context).apply {
            visibility = GONE
            val box = LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                addView(errorText)
                addView(buttonRow("复制诊断信息") { copyDiagnostics() })
                addView(buttonRow("重启应用") { restartApp() })
            }
            addView(box)
        }
        addView(errorOverlay, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    private fun buttonRow(label: String, action: () -> Unit): View =
        Button(context).apply {
            text = label
            setOnClickListener { action() }
        }

    /** WebView 版本门禁（G-WV）：优先框架 API（覆盖 AOSP/Trichrome 变体），PM 查询兜底；拿不到返回 (null, null)。 */
    fun webViewVersion(): Pair<String?, Int?> {
        // API 26+ 框架静态方法：能识别可更新 WebView 的真实包（com.google.android.webview 之外的实现也能拿到）
        runCatching {
            val pkg = WebView.getCurrentWebViewPackage()
            if (pkg != null) {
                return pkg.versionName to pkg.versionName?.substringBefore('.')?.toIntOrNull()
            }
        }
        return runCatching {
            val pi = context.packageManager.getPackageInfo(WEBVIEW_PACKAGE, 0)
            val major = pi.versionName?.substringBefore('.')?.toIntOrNull()
            pi.versionName to major
        }.getOrDefault(null to null)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun ensureWebView(): WebView {
        webView?.let { return it }
        val wv = WebView(context)
        wv.settings.javaScriptEnabled = true
        wv.settings.domStorageEnabled = true // 缺失 → localStorage 为 null，首屏崩（ark/pi 实测）
        wv.settings.databaseEnabled = true
        wv.settings.allowFileAccess = false
        wv.settings.allowContentAccess = false
        wv.settings.cacheMode = WebSettings.LOAD_DEFAULT
        wv.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(wv, false)
        wv.setBackgroundColor(Color.parseColor("#0F1115"))

        wv.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url ?: return false
                if (!request.isForMainFrame) return false
                return !isAllowed(url)
            }

            override fun onPageFinished(view: WebView, url: String) {
                if (!historyCleared) { // 否则返回键卡在加载页
                    historyCleared = true
                    view.clearHistory()
                }
                super.onPageFinished(view, url)
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    AppLog.line("error", "webview", "main frame error ${error.errorCode}: ${error.description}")
                    showError("页面加载失败", "code=${error.errorCode}\n${error.description}")
                }
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                // A6：渲染进程被杀 ≠ Host 崩溃；销毁并重建 WebView
                AppLog.line("warn", "webview", "onRenderProcessGone → 重建 WebView")
                removeView(view)
                view.destroy()
                webView = null
                historyCleared = false
                lastUrl?.let { post { load(it) } }
                return true
            }
        }
        wv.webChromeClient = object : WebChromeClient() {
            override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: android.os.Message): Boolean {
                return false // 不开新窗口
            }
        }
        wv.setDownloadListener { url, _, _, _, _ ->
            showError("下载暂未支持", "url=$url\n（导出方向后续接 DownloadManager/SAF，见 specs/103）")
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG) // 取证通道仅 debug
        // 加到最底层：覆盖层（loading/error）保持在 WebView 之上（FrameLayout 后加者在上）
        addView(wv, 0, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        webView = wv
        return wv
    }

    private fun isAllowed(uri: Uri): Boolean {
        if (uri.scheme == "about" && uri.toString() == "about:blank") return true
        if (uri.scheme == "http" && uri.host in setOf("127.0.0.1", "localhost") && uri.port == originPort) return true
        // 其它一律交系统浏览器（导航围栏，§6.3）
        return try {
            context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (_: Throwable) {
            false
        }
    }

    fun showLoading(text: String) {
        loadingStatus.text = text
        loadingOverlay.visibility = VISIBLE
        errorOverlay.visibility = GONE
    }

    fun showError(title: String, detail: String) {
        AppLog.line("error", "shell", "$title $detail")
        errorText.text = "✗ $title\n\n$detail"
        loadingOverlay.visibility = GONE
        errorOverlay.visibility = VISIBLE
    }

    fun load(url: String) {
        // G-WV：版本下限检查，不达标如实报错
        val (versionName, major) = webViewVersion()
        if (major != null && major < Constants.WEBVIEW_MIN_MAJOR) {
            showError(
                "系统 WebView 版本过低",
                "当前=$versionName 要求≥${Constants.WEBVIEW_MIN_MAJOR}\n请升级系统 WebView（Google Play / 系统更新）后重试。"
            )
            return
        }
        lastUrl = url
        originPort = runCatching { Uri.parse(url).port }.getOrDefault(-1)
        val wv = ensureWebView()
        CookieManager.getInstance().flush()
        wv.loadUrl(url)
        loadingOverlay.visibility = GONE
    }

    fun canGoBack(): Boolean = webView?.canGoBack() == true

    fun goBack() {
        webView?.goBack()
    }

    private fun copyDiagnostics() {
        val text = buildString {
            append("phase=").append(lastUrl?.let { "webview" } ?: "unknown").append('\n')
            append("url=").append(lastUrl?.substringBefore("?")).append('\n')
            append("device=").append(Build.MODEL).append(" API=").append(Build.VERSION.SDK_INT).append('\n')
            append("---- app.log tail ----\n")
            AppLog.tail(60).forEach { append(it).append('\n') }
        }
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("dsh-diagnostics", text))
        Toast.makeText(context, "诊断信息已复制（已去 token）", Toast.LENGTH_SHORT).show()
    }

    private fun restartApp() {
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        intent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        if (intent != null) context.startActivity(intent)
        Runtime.getRuntime().exit(0) // node::Start 每进程一次 → 重启应用是唯一恢复路径
    }

    fun onDestroy() {
        CookieManager.getInstance().flush()
        webView?.destroy()
        webView = null
    }

    companion object {
        const val WEBVIEW_PACKAGE = "com.google.android.webview"
    }
}
