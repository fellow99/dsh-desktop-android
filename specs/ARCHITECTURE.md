# 整体架构（ARCHITECTURE.md）

> 与 `dsh-desktop-ark` 架构同构：**Kotlin 壳 + 进程内 Node（dsh Host）+ 系统 WebView**，数据面全走 loopback HTTP/WS。
> 差异只在：谁提供窗口（系统 Activity）、谁提供 Node 加载器（`aosp-node-bridge` JNI 槽位表）、载荷由 Kotlin 解包（assets 不是路径）。
> 更新：2026-10-27 ｜ 状态：骨架已实现，真机门禁待取证

---

## 1. 分层

```
┌─ APK（applicationId: org.fellow99.dsh.android，arm64-v8a）──────────────┐
│                                                                        │
│  Kotlin 外壳（:app，唯一应用模块）                                       │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ MainActivity（singleTask） → WebShellView（WebView+覆盖层）       │  │
│  │ DshRuntime（Application 级单例，启动编排状态机）                   │  │
│  │   PayloadInstaller  ← assets/dsh-payload/dsh.tar → filesDir       │  │
│  │   Probe             ← HEAD / 探活重试                             │  │
│  │   HostCapabilities  ← 宿主能力注册（JSON 进出、永不抛）            │  │
│  └─────────────▲──────────────────────────────────┬─────────────────┘  │
│                │ loadUrl(http://127.0.0.1:P…)      │ JNI 槽位表          │
│  ┌─────────────┴──────────────────────────────────▼─────────────────┐  │
│  │ Node（进程内 libnode.so / node::Start，detached 32MB 线程）        │  │
│  │   payload/bootstrap.js（正式版：兜底→探针→env 断言→host-boot.js）       │  │
│  │   dsh Host：webserver(127.0.0.1:0) + /api + connection            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  assets/dsh-payload/{dsh.tar, dsh.version}（裸 ustar，AAPT2 兼容）      │
│  jniLibs/arm64-v8a/{libnode.so, libc++_shared.so}   ← 引擎（锁 24.22.1）│
│  （AAR 内）libnode_bridge.so + libnode_host_client.so ← 桥 0.2.0        │
└────────────────────────────────────────────────────────────────────────┘
```

## 2. 进程与线程模型

| 实体 | 归属 | 约束 |
|---|---|---|
| Android 主线程 | App | 绝不做 `dlopen`/`node::Start`/大文件解包（ANR） |
| `dsh-runtime-start` 线程 | App | 解包 + 编排；`PayloadInstaller` 流式解 tar |
| Node 线程 | 桥（detached，32 MB 栈） | `node::Start` 每进程一次；返回即 `Exited` 终态 |
| host dispatch 线程 | 桥 Kotlin 侧 | handler 在**主线程**执行；能力调用 ≤ 10 s 硬超时 |
| WebView 渲染进程 | 系统 | 崩溃 → 销毁重建 WebView（不是 Host 故障） |
| 应用实例 | `singleTask` | 多实例会争 filesDir 与端口 |

## 3. 启动时序（已实现骨架；探针阶段由 `payload/bootstrap.js` 扮演 Host）

```
MainActivity.onCreate
  └─ DshRuntime.ensureStarted(app)                      （单飞；重建直接复用结果）
       ├─ ensureDirs（§8.1 目录骨架）
       ├─ [INSTALLING]  PayloadInstaller.install()
       │     sha256(dsh.tar) 与 dsh.version 对账 → <filesDir>/payload/<sha12>/.ready-<sha12>
       ├─ [STARTING]    NodeRuntime.start({entry:bootstrap.js, payloadRoot:<sha12>, env:DSH_*})
       │     宿主能力先注册；桥物化内置 host.js 到 payloadRoot（不覆盖已有文件）
       ├─ [WAITING]     awaitRunning(60s)；Failed/Exited → failed 终态
       ├─ [PROBING]     轮询 run/ready.json（55s）→ 退化扫 DSH_READY 日志行
       │                Probe.head(origin)：200/303/401 = 在听
       ├─ [READY]       读后即删 ready.json；markRunning()
       └─ [RUNNING]     MainActivity.loadUrl(url)（含一次性 token；URL 只留内存）
失败 → [FAILED]（终态）：错误页显示 stage+日志尾+last-crash；一键「重启应用」（唯一恢复路径）
```

## 4. 数据面与鉴权（不变式）

- WebView 直连 `http://127.0.0.1:<随机端口>`；`?token=` → 303 + 签名 cookie；**壳不参与鉴权**（不解析 token、不写 cookie、不改头）。
- `networkSecurityConfig` 只对 `127.0.0.1` / `localhost` 放行明文；base 保持禁明文；无通配域名。
- 导航围栏：main frame 只放行本机 origin 与 `about:blank`，其余交系统浏览器。

## 5. 生命周期

| 事件 | 行为 |
|---|---|
| 旋转/分屏（Activity 重建） | `DshRuntime` 单例存活；复用 `readyUrl` 直接 `loadUrl`，不重启 Node |
| 进程被杀（LMK） | 冷启 → marker 幂等命中 → 重新 `start`（新进程允许再次 `node::Start`） |
| WebView 渲染进程崩溃 | `onRenderProcessGone` → 重建 WebView → 重放 URL；**不**判 Host 失败 |
| 用户退出（isFinishing） | `DshRuntime.shutdown("user-exit")` → Node 侧钩子；不拦截系统终止 |
| Node 崩溃 / `Exited` | 终态；错误页 + 重启应用 |

## 6. 状态机（`DshRuntime.Phase`）

```
IDLE → INSTALLING → STARTING → WAITING → PROBING → READY → RUNNING
              └─────────┴─────────┴────────┴─→ FAILED（终态）
RUNNING/READY/FAILED → STOPPING → STOPPED
```

## 7. 宿主桥（`@aosp-node-bridge` 0.2.0）

- Node ⇄ Kotlin：`host.invoke(name, json)`（10 s 硬超时）↔ `host.register(name) { json -> json }`（主线程、同步、永不抛）。
- 已注册（骨架批）：`echo`、`log.write`、`runtime.facts`、`perm.allFiles.status`、`shutdown`、`probe.allFiles`[探针]。
- 冻结的 16 项能力面与两段式异步协议：见模块 `104-host-capability-bridge/spec.md` 与规划 §6.4。

## 8. 与 ark 的五条本质差异（设计后果速查）

| # | 面 | ark | 本工程 | 后果 |
|---|---|---|---|---|
| 1 | 桥 | 文件信箱 | JNI 槽位表（同步 10s/8 槽/64KiB） | 异步能力两段式 |
| 2 | 载荷 | Node 自解包（resfile 真路径） | **Kotlin 解包**（assets 非路径） | 本工程 PayloadInstaller |
| 3 | 链接/子进程 | 禁 | 可用 | 垫片 4 条（flock/sharp/require-builtin/sqlite 条件） |
| 4 | 用户目录 | ACL | All-files（MANAGE_EXTERNAL_STORAGE） | 路径模型同桌面；Play 政策面单列 |
| 5 | 后台 | 封死 | 前台服务可行 | Agent 保活（109），Activity 重建必须建模 |
