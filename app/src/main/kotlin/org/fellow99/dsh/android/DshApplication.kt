package org.fellow99.dsh.android

import android.app.Activity
import android.app.Application
import android.os.Bundle
import org.fellow99.dsh.android.common.AppLog
import org.fellow99.dsh.android.host.HostCapabilities

/**
 * Application 级单例宿主：初始化业务日志 + 全局未捕获异常兜底（R3：先落盘再交还默认处理）。
 * DshRuntime 的生命周期由 Activity 驱动（ensureStarted / shutdown），此处不启动。
 */
class DshApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        AppLog.init(this)
        AppLog.line("info", "app", "onCreate pid=${android.os.Process.myPid()} v${versionNameSafe()}")
        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            override fun onActivityResumed(activity: Activity) {
                // 两段式槽位解析：用户从系统设置页（All-files 授权）返回时触发（§6.4）
                HostCapabilities.onAppResumed(this@DshApplication)
            }
            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
            override fun onActivityStarted(activity: Activity) {}
            override fun onActivityPaused(activity: Activity) {
                // 前台计数（T-011）：notify「前台不打扰」门的运行时事实源
                HostCapabilities.onAppPaused(this@DshApplication)
            }
            override fun onActivityStopped(activity: Activity) {}
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
            override fun onActivityDestroyed(activity: Activity) {}
        })
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            runCatching {
                AppLog.line("error", "crash", "thread=${t.name} ${e.javaClass.name}: ${e.message}")
            }
            previous?.uncaughtException(t, e)
        }
    }

    private fun versionNameSafe(): String = runCatching {
        packageManager.getPackageInfo(packageName, 0).versionName
    }.getOrNull() ?: "?"
}
