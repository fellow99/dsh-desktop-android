package org.fellow99.dsh.android

import android.app.Activity
import android.os.Bundle
import android.view.KeyEvent
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

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (shell.canGoBack()) shell.goBack() else super.onBackPressed()
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
