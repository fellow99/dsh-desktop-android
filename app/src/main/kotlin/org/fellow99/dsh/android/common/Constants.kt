package org.fellow99.dsh.android.common

/**
 * 单一事实源：路径 / 超时 / 能力名（docs/000-工程规划.md §6.2 关键参数、§8.1 布局）。
 * 修改任何一项必须同步 specs/101-runtime-launch-orchestration。
 */
object Constants {
    // ── 启动编排参数（§6.2）───────────────────────────────────────────────
    const val START_TIMEOUT_MS = 60_000L
    const val PROBE_RETRIES = 20
    const val PROBE_INTERVAL_MS = 500L
    const val LOG_TAIL_LINES = 200
    const val INSTALL_TIMEOUT_MS = 120_000L
    const val READY_POLL_TIMEOUT_MS = 55_000L
    const val READY_POLL_INTERVAL_MS = 250L

    // ── WebView（§6.3）───────────────────────────────────────────────────
    const val WEBVIEW_MIN_MAJOR = 110

    // ── 日志（§6.7）──────────────────────────────────────────────────────
    const val APP_LOG_TAG = "DSH_ANDROID"
    const val READY_LOG_PREFIX = "DSH_READY "

    // ── 目录布局（§8.1，相对 filesDir）────────────────────────────────────
    const val DIR_DSH_HOME = "dsh-home"
    const val DIR_LOGS = "logs"
    const val DIR_HOME = "home"
    const val DIR_PROFILES = "profiles"
    const val PROFILE_NAME = "android"
    const val DIR_PAYLOAD = "payload"
    const val DIR_PREVIOUS = "previous"
    const val DIR_NODE_BRIDGE = "node-bridge"
    const val DIR_RUN = "run"
    const val DIR_WORKSPACE = "workspace"
    const val DIR_TMP = "tmp"

    // ── 载荷资产（§7.4）──────────────────────────────────────────────────
    // 注意：AAPT2 会把 assets 里的 *.gz 解压并去掉 .gz 后缀，故资产用裸 tar（dsh.tar），
    // 打包器/解包器契约见 scripts/package-payload.mjs 与 PayloadInstaller。
    const val ASSET_PAYLOAD = "dsh-payload/dsh.tar"
    const val ASSET_VERSION = "dsh-payload/dsh.version"
    const val READY_FILE = "ready.json"
    const val MARKER_PREFIX = ".ready-"
}
