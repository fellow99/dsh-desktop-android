# TEST_REPORT · 111-pty-integration

> 日期：2026-11-01 ｜ 真机：**MIX（Xiaomi Mi MIX / lithium）· Android 8.0 / API 26 · arm64-v8a**（minSdk 29→26 后可装）
> WebView：138.0.7204.181（≥110 门禁 ✓）｜ 引擎：libnode **26.13.0**（`node-runtime` AAR）｜ PTY：`node-pty:26.13.0`（原生 node-pty 1.1.0）
> 证据目录：`logs/20261101-1/evidence/`（截图 20–34、app.log、node_bridge.log）
> 纪律：宪法 C3（命令输出/截图/日志为唯一判据；无证据不记 ✅）

## 结论速览

| 组 | 结果 |
|---|---|
| A 环境与依赖 | ✅ 三件套 Maven Central 可达；`assembleFullDebug` 通过，5 个 .so 入包 |
| B 引擎升级回归（24.22.1→26.13.0） | ✅ Host READY；对话/看图/工作区持久化均正常 |
| C node-pty 加载 | ✅ S6 垫片 installed；nativeLibraryDir 有 libpty_node.so；`require('node-pty')` 经 process.dlopen 成功 |
| D spawnTerminal | ✅ fork `/system/bin/sh -i`（app 子进程可见）；echo/pwd 正确 |
| E 终端面板 | ✅ 右侧栏终端渲染、输入回环、resize 无错、关闭后无残留进程 |
| F 保活 | ✅（inspectActivity 保守 unknown；未见误回收） |
| G 基本功能 | ✅ API KEY + deepseek-flash；建工作区；对话「介绍一下 yourself」5s；看图分析准确 |

## 逐用例

| 用例 | 结果 | 证据 |
|---|---|---|
| TC-111-A1 三件套可达 | ✅ | 三 URL HTTP 200（node-bridge 0.2.0 / runtime 26.13.0 / pty 26.13.0） |
| TC-111-A2 构建 + 5 .so | ✅ | `BUILD SUCCESSFUL`；APK lib/arm64-v8a 含 libnode/libc++/libnode_bridge/libnode_host_client/**libpty_node.so(71,120B)** |
| TC-111-B1 启动链/引擎 | ✅ | app.log `READY ... bootMs≈39s`；probe intl/sqlite/zstd/sh ok |
| TC-111-B2 持久化/回归 | ✅ | 重启后 demo 工作区与会话「介绍 AI 编码助手」保留；通知/搜索等未动 |
| TC-111-C1 S6 垫片登记 | ✅ | `shim DSH_ANDROID_SHIM node-pty: installed` |
| TC-111-C2 pty 加载事实 | ✅ | 终端可 fork（等价于 loadable）；S6 日志 native 路径正确 |
| TC-111-D1 spawnTerminal fork | ✅ | `/proc/<pid>/cmdline = /system/bin/sh -i`，PPID=app |
| TC-111-D2 echo/pwd | ✅ | `pwd`→`/data/data/.../files/workspace/demo`；`echo REPRO_OK` 回显 |
| TC-111-E1 面板渲染 | ✅ | evidence/30、32：tab `>_ sh` + 提示符 `lithium:.../demo $` |
| TC-111-E2 输入回环/resize | ✅ | 键入命令执行并回显；resize 无 `pty.resize` 报错 |
| TC-111-E3 close/kill 无残留 | ✅ | 关闭终端标签后 sh 进程 `GONE`，app 无子进程 |
| TC-111-G1 API KEY + 模型 | ✅ | 设置页「已保存 DeepSeek」；composer 显示 DeepSeek-V4.1-Flash(=deepseek-flash)，推理 High |
| TC-111-G2 建工作区 | ✅ | picker 沙箱 tab → demo；hero 显示 `demo` |
| TC-111-G3 对话 | ✅ | 「已完成，用时 5秒」，deepseek-flash 驱动 |
| TC-111-G4 看图分析 | ✅ | read_image logo.png → 「200×200 PNG，主色天蓝(~#29A3E8)，圆角对话气泡内嵌两圆点=聊天机器人头像」 |

## 测试中发现并修复的缺陷（本需求范围内）

| # | 缺陷 | 现象 | 修复 |
|---|---|---|---|
| B1 | **ESM 无 require** | `spawnTerminal` 报 `require is not defined` | `@dsh-android/subprocess` 用 `createRequire(import.meta.url)` 经 CJS 桥加载 node-pty |
| B2 | **nativeLibraryDir 为空** | `useLegacyPackaging=false` 时 .so 不抽取，S6 找不到实体文件 | 改 `useLegacyPackaging=true`（安装时抽取到 nativeLibraryDir，唯一可执行位） |
| B3 | **symlink→.so 被当 JS 解析** | `Failed to load native module` / `Invalid or unexpected token`（Node 按 realpath 的 `.so` 扩展名选加载器） | 弃 symlink；materialize 补丁令 node-pty `loadNativeModule` 用 `process.dlopen` 从 nativeLibraryDir 加载 |
| B4 | **Kotlin 预载与 Node dlopen 冲突** | 预载后 Node 再 dlopen 同 inode 加载异常 | 移除 `System.loadLibrary("pty_node")` 预载，改由 Node 侧 process.dlopen 独占加载 |
| B5 | **node-pty JS/原生版本错配** | 开终端报 `Usage: pty.resize(fd, cols, rows)`（上架原生件=node-pty 1.1.0 的 3 参 resize；载荷 JS=1.2.0-beta.15 的 5 参） | 装配期把载荷 node-pty JS 对齐到 **1.1.0**（`ensureNodePtyJsVersion`，npm pack） |
| B6 | **workspace-picker 根围栏误判** | 建/开工作区报 `outside the allowed roots (root fence)`（list 用 realpath `/data/user/0/...`，fencePath 只做词法比对 `/data/data/...`） | `fencePath` 增加 canonical 两侧比较（与 list 内部纪律一致） |

> B6 为**既有缺陷**（真机 filesDir 暴露 `/data/data` 表示时触发），非 111 引入；因阻塞“建工作区”测试而一并修复。

## 已知限制 / 未复测项（诚实登记，C2）

1. **All-files / 文档·下载 tab 在 API 26 不可用**（`MANAGE_EXTERNAL_STORAGE` 需 30+）；沙箱工作区不受影响。UI 上文档/下载 tab 会走权限门。
2. **`/_android/facts` 未直连取证**：连接围栏要求页面 Cookie（本机无法从外部带 Cookie），故 pty 字段未截图；以 S6 日志 + 实际终端 fork 为等价证据。
3. **`read_image` 首次调用失败、重试成功**（agent 自述）；属轻微抖动，未定位到根因，登记为待观察项（疑似 sharp 替身首调预热），不影响最终结果。
4. **`signalForeground`/`inspectForeground` 未实现**（诚实降级）：面板交互 Ctrl-C 走 `write('\x03')` 输入通道（tty 驱动发 SIGINT），不依赖这两个方法；进程组信号/前台检查不可用。
5. 模拟器未参与本轮（真机 API26 全程取证）。

## 产物

- APK：`app/build/outputs/apk/full/debug/app-full-debug.apk`（full/debug，arm64-v8a，含 5 .so + dsh.tar 载荷 sha12=`05bf8a20de6a`）
- 可复现：`node scripts/assemble-payload.mjs --deploy --apply` → `package-payload` → `assembleFullDebug` 已端到端复验（B5 对齐、111 加载补丁均自动生效）
