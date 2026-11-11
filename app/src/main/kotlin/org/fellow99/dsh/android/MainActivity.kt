package org.fellow99.dsh.android

import android.app.Activity
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import org.fellow99.dsh.android.host.HostCapabilities
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import org.fellow99.dsh.android.runtime.DshRuntime
import org.fellow99.dsh.android.ui.WebShellView

/**
 * 唯一 Activity（singleTask）：装配 WebShellView、驱动 DshRuntime；
 * Activity 重建（旋转/分屏）→ 复用就绪 URL，不重启 Node（A5/G11）。
 */
class MainActivity : Activity() {

    private lateinit var shell: WebShellView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        shell = WebShellView(this)
        setContentView(shell)
        // 113-system-back：内容不占用系统顶部状态栏/底部导航区；全面屏（挖孔/手势条）同步适配安全区。
        installSystemBarInsets()

        DshRuntime.setListener { phase, url ->
            when (phase) {
                DshRuntime.Phase.INSTALLING -> shell.showLoading("正在解包载荷（首次启动较慢）…")
                DshRuntime.Phase.STARTING -> shell.showLoading("正在启动 Node…")
                DshRuntime.Phase.WAITING -> shell.showLoading("等待 dsh Host 就绪…")
                DshRuntime.Phase.PROBING -> shell.showLoading("探活 loopback 服务…")
                // 仅在 RUNNING 加载一次（READY 不重复触发，避免打断首屏）
                DshRuntime.Phase.RUNNING -> {
                    val u = url ?: DshRuntime.readyUrl
                    if (u != null) shell.load(u)
                }
                DshRuntime.Phase.FAILED -> {
                    val f = DshRuntime.failure
                    shell.showError(
                        "启动失败（stage=${f?.stage}）",
                        (f?.message ?: "unknown") + "\n\n---- node 日志尾 ----\n" +
                            (f?.logTail?.takeLast(40)?.joinToString("\n") ?: "")
                    )
                }
                // node::Start 每进程一次：STOPPED 后唯一出路是重启应用（如实呈现，不留死屏）
                DshRuntime.Phase.STOPPED -> shell.showError(
                    "应用已退出",
                    "Node 运行时每进程只能启动一次。点击「重启应用」重新启动。"
                )
                else -> Unit
            }
        }

        DshRuntime.ensureStarted(application)
    }

    override fun onDestroy() {
        if (isFinishing) {
            DshRuntime.shutdown("user-exit")
        }
        shell.onDestroy()
        super.onDestroy()
    }

    /**
     * 配置变化（横竖屏/分屏/密度等，见 Manifest configChanges）：Activity 不重建，
     * WebView 保留，页面内容按新布局自适应重排——不再重载 SPA（无 “HARNESS loading”）。
     */
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        shell.handleConfigurationChanged(newConfig)
    }

    /** 运行期权限结果回传（API<30 的存储权限系统弹窗）：完成两段式槽位。 */
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        HostCapabilities.onRequestPermissionsResult(requestCode, grantResults)
    }

    /**
     * 113-system-back：内容不占用系统顶部状态栏/底部导航区；全面屏（挖孔/手势条）同步适配安全区。
     *
     * API 30+：显式 `setDecorFitsSystemWindows(false)` 进入 edge-to-edge（兼容 Android 15/16 强制
     * edge-to-edge），再由监听器按 systemBars()+displayCutout() insets 给根视图垫安全区；
     * API 26–29：LAYOUT_* flag + `systemWindowInset*` 回退。不引入 androidx 依赖。
     */
    private fun installSystemBarInsets() {
        val decor = window.decorView
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
        } else {
            decor.systemUiVisibility = decor.systemUiVisibility or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        }
        shell.setOnApplyWindowInsetsListener { view, insets ->
            val l: Int
            val t: Int
            val r: Int
            val b: Int
            if (Build.VERSION.SDK_INT >= 30) {
                val system = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                l = system.left; t = system.top; r = system.right; b = system.bottom
            } else {
                l = insets.systemWindowInsetLeft
                t = insets.systemWindowInsetTop
                r = insets.systemWindowInsetRight
                b = insets.systemWindowInsetBottom
            }
            view.setPadding(l, t, r, b)
            insets
        }
        shell.requestApplyInsets()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // 113-system-back：系统返回键统一交 Web UI seam（window.__dshSystemBack）按上下文处理：
        // 设置页/抽屉/弹窗关闭；首页/会话页无操作；**永不** finish() 退桌面，也不用 WebView 历史后退。
        shell.handleSystemBack()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        // 外接键盘快捷键（首期）：刷新页面
        if (keyCode == KeyEvent.KEYCODE_F5 || (keyCode == KeyEvent.KEYCODE_R && event?.isCtrlPressed == true)) {
            DshRuntime.readyUrl?.let { shell.load(it) }
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
}
