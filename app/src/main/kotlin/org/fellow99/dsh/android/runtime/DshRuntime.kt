package org.fellow99.dsh.android.runtime

import android.app.Application
import android.os.Environment
import org.fellow99.dsh.android.BuildConfig
import org.fellow99.dsh.android.common.AppLog
import org.fellow99.dsh.android.common.Constants
import org.fellow99.dsh.android.host.HostCapabilities
import org.fellow99.nodebridge.NodeRuntime
import org.fellow99.nodebridge.NodeRuntimeOptions
import org.fellow99.nodebridge.NodeState
import org.json.JSONObject
import java.io.File

/**
 * 启动编排状态机（§6.2）——Application 级单例（A5：Activity 重建不重启 Node）。
 *
 * idle → installing → starting → waiting → probing → ready → running
 *              └──────────┴─────────┴────────┴──→ failed（终态，需重启应用）
 *
 * 就绪判据（§4.6）：ready.json 可读（含 url）且 HEAD / 探活通过；读后立即删除 ready.json。
 */
object DshRuntime {

    enum class Phase { IDLE, INSTALLING, STARTING, WAITING, PROBING, READY, RUNNING, FAILED, STOPPING, STOPPED }

    data class Failure(val stage: String, val message: String, val logTail: List<String>)

    @Volatile
    var phase: Phase = Phase.IDLE
        private set

    @Volatile
    var failure: Failure? = null
        private set

    /** 就绪后的完整 URL（含一次性 token），只留内存（§8.4）。 */
    @Volatile
    var readyUrl: String? = null
        private set

    @Volatile
    var payloadSha12: String? = null
        private set

    private val started = java.util.concurrent.atomic.AtomicBoolean(false)
    private val main = android.os.Handler(android.os.Looper.getMainLooper())
    private var listener: ((Phase, String?) -> Unit)? = null

    fun setListener(l: ((Phase, String?) -> Unit)?) {
        listener = l
        val url = readyUrl
        val p = phase
        if (l != null && (p != Phase.IDLE || url != null)) {
            main.post { l(p, url) }
        }
    }

    fun ensureStarted(app: Application) {
        if (!started.compareAndSet(false, true)) return
        Thread({
            try {
                runSequence(app)
            } catch (t: Throwable) {
                onFailed("orchestration", "${t.javaClass.simpleName}: ${t.message}")
            }
        }, "dsh-runtime-start").apply {
            isDaemon = true
            start()
        }
    }

    fun shutdown(reason: String) {
        if (phase != Phase.RUNNING && phase != Phase.READY && phase != Phase.FAILED) return
        setPhase(Phase.STOPPING)
        AppLog.line("info", "runtime", "shutdown reason=$reason")
        startedRuntime?.shutdown(reason)
        setPhase(Phase.STOPPED)
    }

    @Volatile
    private var startedRuntime: NodeRuntime? = null

    private fun runSequence(app: Application) {
        val t0 = System.currentTimeMillis()
        // ── 目录骨架（§8.1）───────────────────────────────────────────
        val filesDir = app.filesDir
        val dshHome = File(filesDir, Constants.DIR_DSH_HOME)
        val payloadBase = File(filesDir, Constants.DIR_PAYLOAD)
        val runDir = File(filesDir, Constants.DIR_RUN)
        File(dshHome, Constants.DIR_LOGS).mkdirs()
        File(dshHome, Constants.DIR_HOME).mkdirs()
        File(dshHome, Constants.DIR_PROFILES).mkdirs()
        File(dshHome, "storages").mkdirs()
        File(dshHome, "sessions").mkdirs()
        File(filesDir, Constants.DIR_WORKSPACE).mkdirs()
        File(filesDir, Constants.DIR_TMP).mkdirs()
        payloadBase.mkdirs()
        runDir.mkdirs()

        // ── installing ────────────────────────────────────────────────
        setPhase(Phase.INSTALLING)
        val install = PayloadInstaller.install(app)
        payloadSha12 = install.sha12

        // ── starting ──────────────────────────────────────────────────
        setPhase(Phase.STARTING)
        val runtime = NodeRuntime.getInstance(app)
        startedRuntime = runtime
        // [PROBE] 引擎探测证据（P0 门禁 G12；探针阶段临时，验收后随 payload/probe 一并移除）
        runCatching {
            val probeDir = File(filesDir, "probe")
            probeDir.mkdirs()
            File(probeDir, "engine.json").writeText(runtime.probeEngine())
        }.onFailure { AppLog.line("warn", "probe", "probeEngine 失败：${it.message}") }

        // 宿主能力先于 start 注册（桥约束：顺序不能反）
        HostCapabilities.register(app, runtime)

        val userRoot = Environment.getExternalStorageDirectory().absolutePath
        val workspaceDir = File(filesDir, Constants.DIR_WORKSPACE)
        val opts = NodeRuntimeOptions(
            entry = "bootstrap.js", // 入口恒为 bootstrap（env 断言/探针/垫片登记）；它再 require('./host-boot.js') 启动 Host
            // S3 垫片（node-addon-require-builtin 纯 JS 替身）依赖内部模块访问
            execArgv = listOf("--expose-internals"),
            // 桥的内置载荷（host.js 客户端等）物化进解包目录；已存在的文件（我们的 bootstrap.js）不会被覆盖
            materializeBuiltinPayload = true,
            payloadRoot = install.dir.absolutePath,
            env = mapOf(
                "DSH_HOME" to dshHome.absolutePath,
                "HOME" to File(dshHome, Constants.DIR_HOME).absolutePath,
                "DSH_PROFILE_NAME" to Constants.PROFILE_NAME,
                "DSH_PLATFORM" to "android",
                "DSH_FILES_DIR" to filesDir.absolutePath,
                "DSH_PAYLOAD_DIR" to install.dir.absolutePath,
                "DSH_USER_ROOT" to userRoot,
                "DSH_STORAGE_MODE" to BuildConfig.DSH_STORAGE_MODE,
                "DSH_APP_VERSION" to BuildConfig.VERSION_NAME,
                // bundle 覆盖层（sandbox-policy workspaceRoot）与图片垫片诊断使用
                "DSH_ANDROID_WORKSPACE" to workspaceDir.absolutePath,
                "DSH_ANDROID_APP_LOG" to File(dshHome, "${Constants.DIR_LOGS}/app.log").absolutePath,
                "DSH_PERMISSION_MODE" to "workspace-write",
                // P2-6 诊断端点：仅 debug 构建开启 /_android/facts（release 恒关，FR-105-013）
                // CN 网络：npmjs 直连慢/挂（2026-10-29 实测），registry 默认走镜像（--registry 显式指定时覆盖）
                "DSH_ANDROID_REGISTRY" to "https://registry.npmmirror.com",
                "DSH_ANDROID_FACTS" to if (BuildConfig.DEBUG) "1" else "0",
                "TMPDIR" to File(filesDir, Constants.DIR_TMP).absolutePath,
            ),
        )
        val startResult = runtime.start(opts)
        if (!startResult.ok) {
            onFailed("starting", "rc=${startResult.code} state=${startResult.state} msg=${startResult.message ?: "-"} lastError=${runtime.lastError}")
            return
        }

        // ── waiting ───────────────────────────────────────────────────
        setPhase(Phase.WAITING)
        val awaited = runtime.awaitRunning(Constants.START_TIMEOUT_MS)
        when (awaited) {
            is NodeState.Running -> Unit
            is NodeState.Failed -> {
                onFailed("waiting", "stage=${awaited.stage} msg=${awaited.message}")
                return
            }
            is NodeState.Exited -> {
                onFailed("waiting", "Node 提前退出 code=${awaited.code}（node::Start 每进程一次，需重启应用）")
                return
            }
            else -> {
                onFailed("waiting", "awaitRunning 超时/异常态：$awaited")
                return
            }
        }

        // ── probing ───────────────────────────────────────────────────
        setPhase(Phase.PROBING)
        val ready = awaitReadyEnvelope(app)
        if (ready.failure != null) {
            onFailed(ready.stage ?: "probing", ready.failure)
            return
        }
        val envelope = ready.envelope!!
        val origin = envelope.optString("origin", "")
        val url = envelope.optString("url", origin)
        if (origin.isEmpty()) {
            onFailed("probing", "ready.json 缺少 origin：$envelope")
            return
        }
        val probe = Probe.head(origin, Constants.PROBE_RETRIES, Constants.PROBE_INTERVAL_MS)
        if (!probe.ok) {
            onFailed("probing", "探活失败 attempts=${probe.attempts} error=${probe.error}")
            return
        }

        // 就绪：读后即删（§8.4）
        runCatching { File(runDir, Constants.READY_FILE).delete() }
        runtime.markRunning()
        readyUrl = url
        setPhase(Phase.READY)
        setPhase(Phase.RUNNING)
        PayloadInstaller.cleanupStale(app, install.sha12)
        AppLog.line("info", "runtime", "READY url-origin=$origin bootMs=${System.currentTimeMillis() - t0}")
    }

    /** ready 信封读取结果：failure 非空 = 应立即终态失败（附诊断）。 */
    private class ReadyResult(val envelope: JSONObject? = null, val failure: String? = null, val stage: String? = null)

    /**
     * 轮询 ready.json；读到失败态（failed/payload-missing）立即返回失败诊断；
     * 读到 ready 后**立即删除文件**（含一次性 token，不留盘，§8.4）。
     * 超时后退化扫描 node_bridge.log 的 DSH_READY 行：该行只含 origin（无 token），
     * 不能支撑鉴权加载 ⇒ 如实判失败（宪法 C2），而不是拿无 token 的 URL 去撞 401。
     */
    private fun awaitReadyEnvelope(app: Application): ReadyResult {
        val runDir = File(app.filesDir, Constants.DIR_RUN)
        val readyFile = File(runDir, Constants.READY_FILE)
        val deadline = System.currentTimeMillis() + Constants.READY_POLL_TIMEOUT_MS
        while (System.currentTimeMillis() < deadline) {
            if (readyFile.isFile) {
                val text = runCatching { readyFile.readText() }.getOrNull()
                if (!text.isNullOrBlank()) {
                    val obj = runCatching { JSONObject(text) }.getOrNull()
                    if (obj != null) {
                        when (obj.optString("phase")) {
                            "ready" -> {
                                // 读后即删（无论是否采纳，token 都不留盘，§8.4）
                                runCatching { readyFile.delete() }
                                // 陈旧信封防御：上次进程被强杀时残留的 ready.json 指向已死端口，
                                // 消费它必然探活失败，且本代自己的 fresh ready.json 会毒化下一代
                                //（失败循环：44251→34219→38513 实证）。非本进程 pid 的一律丢弃并继续轮询。
                                val envelopePid = obj.optInt("pid", -1)
                                if (envelopePid != -1 && envelopePid != android.os.Process.myPid()) {
                                    AppLog.line(
                                        "warn", "runtime",
                                        "stale ready.json discarded (pid=$envelopePid != ${android.os.Process.myPid()})；keep polling",
                                    )
                                } else {
                                    return ReadyResult(envelope = obj)
                                }
                            }
                            "failed", "payload-missing" -> {
                                runCatching { readyFile.delete() }
                                val diag = obj.optString("diagnostic", "Node 侧启动失败（无诊断）")
                                return ReadyResult(failure = diag, stage = "probing")
                            }
                        }
                    }
                }
            }
            try {
                Thread.sleep(Constants.READY_POLL_INTERVAL_MS)
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
                break
            }
        }
        runCatching { readyFile.delete() }
        return ReadyResult(
            failure = "ready.json 超时（${Constants.READY_POLL_TIMEOUT_MS}ms）；未取得带一次性 token 的入口 URL，请重启应用",
            stage = "probing",
        )
    }

    /** 日志脱敏（C10）：抹去一次性 token 与常见凭据形态后再进错误页/剪贴板。 */
    private fun sanitizeLine(line: String): String = line
        .replace(Regex("([?&]token=)[^&\\s\"]+"), "$1***")
        .replace(Regex("sk-[A-Za-z0-9]{8,}"), "sk-***")
        .replace(Regex("Bearer +[A-Za-z0-9._-]{8,}"), "Bearer ***")

    private fun onFailed(stage: String, message: String) {
        AppLog.line("error", "runtime", "FAILED stage=$stage msg=$message")
        val rt = startedRuntime
        val tail = mutableListOf<String>()
        if (rt != null) {
            runCatching { rt.logs(Constants.LOG_TAIL_LINES) }.getOrDefault(emptyList())
                .forEach { tail += "[${it.stream}] ${sanitizeLine(it.text)}" }
        }
        runCatching { rt?.lastCrash() }.getOrNull()?.let { tail += "[crash] ${sanitizeLine(it.raw.take(2000))}" }
        failure = Failure(stage, sanitizeLine(message), tail.takeLast(Constants.LOG_TAIL_LINES))
        runCatching { rt?.markFailed("$stage: $message") }
        setPhase(Phase.FAILED)
    }

    private fun setPhase(p: Phase) {
        phase = p
        val url = readyUrl
        main.post {
            listener?.invoke(p, url)
        }
    }
}
