# 技术选型（TECH.md）

> 版本锁定值是**唯一事实源**：构建工具看 `gradle/libs.versions.toml` 与 `gradle/wrapper/gradle-wrapper.properties`；引擎看 `aosp-node-runtime/runtime.lock.json`；上游看 `deepseek-harness` 的 tag。
> 更新：2026-10-27

## 一、锁定值

| 项 | 值 | 来源 / 说明 |
|---|---|---|
| 上游 | `deepseek-harness` `dsh-v0.2.1-rc.2`（`engines.node = ^22.19.0 \|\| >=24.0.0`） | 子模块 tag 固定 |
| 引擎 | Node **24.22.1**，`arm64-v8a`，`libnode.so` 71,070,040 B（sha256 `f6a1610a…`，16 KB 对齐） | `runtime.lock.json` active；八项 ELF 门禁 |
| 引擎投放 | `app/src/main/jniLibs/arm64-v8a/`（`scripts/provision-engine.mjs`，sha256 对账后复制） | **偏差登记**：Maven Central 的 `io.github.fellow99:node-runtime` 尚无 24.22.1（仅 24.2.0/18.20.4）；待其发布后切回 Maven 依赖 |
| 桥 | `io.github.fellow99:node-bridge:0.2.0`（Maven Central） | `libnode_bridge.so` + `libnode_host_client.so` + 内置引导 JS |
| Gradle | 8.12（wrapper 锁定） | `gradle/wrapper/gradle-wrapper.properties` |
| AGP | 8.10.1 | `gradle/libs.versions.toml`（受 Gradle 8.12 上限约束；8.11+ 需 Gradle 8.13） |
| Kotlin | 2.2.20（android 插件，jvmTarget 17） | 同上 |
| JDK | 17 字节码目标（构建机 JDK 21 可用） | `compileOptions` |
| Android SDK | compileSdk 36 / targetSdk 36 / minSdk 29 / buildTools 36.0.0 | 决议 D6；buildTools 钉 36.0.0 避免 AGP 自动下载 35.x 失败 |
| ABI | 仅 `arm64-v8a` | A14；引擎只有 arm64 |
| UI | Kotlin View 体系（**不用 Compose**） | 外壳只有 WebView + 覆盖层，避免 Compose 编译器依赖；**偏差登记**（规划 §6.3 提到 Compose 侧加载视图，等价实现为 View 覆盖层） |
| WebView 版本门禁 | `PackageManager` 查 `com.google.android.webview` 版本 ≥ 110 | **偏差登记**：不用 `androidx.webkit`（零 AndroidX 依赖策略）；语义等价 |
| 模块结构 | 单 `:app` 模块 + `flavorDimension "dist"`（full / store） | §6.1 / §12.1 |

## 二、载荷格式契约（与 ark 不同，必须注意）

| 项 | 契约 | 原因 |
|---|---|---|
| 资产名 | `assets/dsh-payload/dsh.tar`（**裸 ustar，无 .gz**） | **AAPT2 会把 assets 里的 `*.gz` 解压并去掉 `.gz` 后缀**——实测 APK 内出现 `dsh.tar`；索性以裸 tar 为契约，压缩交给 APK zip 容器 |
| tar 形态 | ustar、条目排序、mtime=0、uid/gid=0、无 pax/GNU 扩展 | 与 Kotlin `TarReader`（`PayloadInstaller.kt`）严格对齐；遇到 `x/g/L` 条目直接报错 |
| 版本文件 | `dsh.version` 首行 `sha256=<tar 哈希>`，随后 `files=` / `bytes=` / `version=` / `inputsKey=` | 幂等键 = sha 前 12 位；`PayloadInstaller` 解包流上对账 |
| 打包器 | `scripts/package-payload.mjs`（确定性，输入未变则跳过） | 断言：无 symlink / 绝对路径 / `..`；单文件 < 512 MiB |

## 三、关键常量（`common/Constants.kt` 单一事实源）

| 常量 | 值 |
|---|---|
| `START_TIMEOUT_MS` | 60 000 |
| `PROBE_RETRIES` / `PROBE_INTERVAL_MS` | 20 / 500 ms |
| `READY_POLL_TIMEOUT_MS` / `READY_POLL_INTERVAL_MS` | 55 000 / 250 ms |
| `LOG_TAIL_LINES` | 200 |
| `INSTALL_TIMEOUT_MS` | 120 000（保留，解包进度上报时启用） |
| `WEBVIEW_MIN_MAJOR` | 110 |
| 目录名 | `dsh-home` / `payload` / `previous` / `node-bridge` / `run` / `workspace` / `tmp` / profile `android` |

## 四、否决项（与规划 §3.4 对齐，不许悄悄翻案）

| 否决项 | 理由 |
|---|---|
| fork / patch 上游 | 升级即死；只用 profile/bundle/seam 扩展点 + 白名单垫片 |
| WebView 内嵌 JS 引擎（QuickJS/Hermes） | 不是 Node，Host 起不来 |
| 远端/云端 Node | 违背本地离线 |
| Compose 外壳 | 见上（偏差登记）；如后续引入需整体评审 |
| AndroidX 依赖 | 外壳零 AndroidX（`android.useAndroidX=true` 仅为桥 AAR 兼容保留） |
| 固定端口 | `--port 0` 随机；cookie audience 每次启动不同 |
| 模拟器 / x86_64 | 引擎只有 arm64-v8a；只认真机 |

## 五、上游待复用产物（未装配，102/P1 范围）

| 产物 | 来源 | 状态 |
|---|---|---|
| dsh 生产依赖树 + web dist | `deepseek-harness`（tag 已核对，构建管线同 ark） | ✅ `assemble-payload.mjs` 已实现（13560 文件/142MiB 实测） |
| `dshmarket` 前端 | `dsh-market` 1.67.0 构建 | ⬜ |
| `@dsh-android/*` 插件包 | 复制 ark 并改名（附录 C） | 🟡 bundle/attachment-image 已交付；subprocess/shell/sandbox/workspace-picker 属 P2/P3 |
| pnpm 10.34.6 引擎 | ark 同版 | ⬜ |
