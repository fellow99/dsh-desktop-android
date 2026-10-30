package org.fellow99.dsh.android.host

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import org.fellow99.dsh.android.R
import org.fellow99.dsh.android.common.AppLog

/**
 * AgentKeepAlive（specs/109）：turn 运行期 dataSync 前台服务保活，turn 结束即停。
 *
 * - 由宿主能力 `power.keepAwake`（{enable:true|false}）启停（JS 侧 notify 插件在
 *   agent/status running→idle 事件里调用，见 packages/notify-android）；
 * - dataSync 类型：Android 14+ 需在 manifest 声明 foregroundServiceType="dataSync"，
 *   并以 startForeground(id, notification, FOREGROUND_SERVICE_TYPE_DATA_SYNC) 提升；
 * - 服务自身无业务逻辑：纯保活面，通知不可滑动（ongoing），停止即消失；
 * - 纪律：startForegroundService 后必须立刻 startForeground（5s ANR 窗口）；
 *   重复 stop 为无害操作（系统忽略）。
 */
class KeepAliveService : Service() {

    companion object {
        const val CHANNEL_ID = "dsh-keepalive"
        const val NOTIFICATION_ID = 2001

        fun start(context: Context) {
            val intent = Intent(context, KeepAliveService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= 26) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
                AppLog.line("info", "keepalive", "start requested")
            } catch (t: Throwable) {
                // 后台启动限制（后台时 turn 已不可能在跑）：如实记日志，不影响调用方
                AppLog.line("warn", "keepalive", "start failed: ${t.javaClass.simpleName}: ${t.message}")
            }
        }

        fun stop(context: Context) {
            try {
                context.stopService(Intent(context, KeepAliveService::class.java))
                AppLog.line("info", "keepalive", "stopped")
            } catch (t: Throwable) {
                AppLog.line("warn", "keepalive", "stop failed: ${t.javaClass.simpleName}: ${t.message}")
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = getSystemService(NotificationManager::class.java)
            nm?.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "DSH 保活", NotificationManager.IMPORTANCE_MIN),
            )
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification: Notification = buildNotification()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
        AppLog.line("info", "keepalive", "foreground active (dataSync)")
        // START_NOT_STICKY：turn 结束由调用方显式 stop；系统回收后不自动复活
        return START_NOT_STICKY
    }

    /**
     * dataSync 前台服务在 API 35+ 有 6h/24h 硬限时：超时系统会抛
     * ForegroundServiceDidNotStopInTimeException（崩溃）。超时 = 正常路径的 stop 丢失
     * （如 JS 侧异常），此处主动 stopSelf 把崩溃转为如实降级（specs/109 纪律：结束即停）。
     */
    override fun onTimeout(startId: Int) {
        AppLog.line("warn", "keepalive", "FGS timeout (dataSync); stopping to avoid system crash")
        stopSelf()
    }

    override fun onTimeout(startId: Int, fgsType: Int) {
        AppLog.line("warn", "keepalive", "FGS timeout (type=$fgsType); stopping to avoid system crash")
        stopSelf()
    }

    private fun buildNotification(): Notification {
        val title = getString(R.string.keepalive_title)
        val text = getString(R.string.keepalive_text)
        val builder = if (Build.VERSION.SDK_INT >= 26) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setSmallIcon(R.drawable.ic_stat_dsh)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .build()
    }
}
