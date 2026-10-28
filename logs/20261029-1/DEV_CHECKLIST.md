# DEV_CHECKLIST（logs/20261029-1/）

> 阶段：Development ｜ 日期：2026-10-29 ｜ 基线：af7ad93（`development: P1/P2 执行前基线入库`）

## P1 取证（模拟器 emulator-5554，应用内会话驱动）

| # | 任务 | 结果 | 证据 |
|---|---|---|---|
| P1-1 | bash 单命令端到端 | ✅ 通过：`echo`→`DSH-BASH-E2E-OK`，exit 0，5s；预检 EACCES 风险未出现 | evidence/10-bash-e2e-browser.jpg、12-bash-e2e-device.png |
| P1-2 | grep/glob 纯 JS 后端 | ❌→登记：上游 tool-fs-search 打包 ripgrep 裸 spawn（`no rg on PATH`），**纯 JS 后端假设证伪**；bash 兜底 grep/glob 正常（needle-42 命中 b.txt:1）；修复归 206（纯 JS 搜索后端替换） | evidence/20-grep-glob-defect-browser.jpg |
| P1-3 | git clone/push 端到端 | ✅ 通过（经本机 git smart-HTTP + adb reverse）：clone History complete + git_log 3 条；push `refs/heads/main: ok` + 服务端内容一致。**附带发现**：git 工具仅支持 http(s)（git:// 不识别）；shell 侧网络受限而 git 走进程内通路 | evidence/30-git-e2e-push-browser.jpg |
| P1-4 | G6 安装链 lookup | ✅ 代码完成（desktopPnpm 补 lookup 成员，worker 跑 `pnpm view`）；**方向修正**：lookup 在上游 harness plugin-manager（viewProfilePackage→execa 裸 spawn），plugin-manager 不读 desktopPnpm → 需上游 feature-detect 反哺；PATH 垫片不可行（无可 spawn 的 node/pnpm，W^X） | packages/market-android/lib/index.js（lookup 成员） |
| P1-5 | 模拟器全量取证 | ✅ 引擎/时区/授权/通知/文档写入全部通过：notify 通知栏实证（事件驱动、内容不可定制）；Documents 写入闭环（u0_a216:media_rw, 27B 读回一致）。**真机复测登记遗留** | evidence/40-notify-shade.png、50-docs-write-closure.jpg |

## P2 代码

| # | 任务 | 结果 | 改动 |
|---|---|---|---|
| P2-1 | 删除/移动/复制/chmod 兜底 | ✅ 路径证实：bash 兜底 rm/mv/cp 可用（P1-1 证据链）；ctx.fs 原语仍属上游 L4（维持清单登记，长期物化期补丁方向） | 无代码（文档登记） |
| P2-2 | PTY 完整终端 | ⛔ 阻塞登记：上游 terminal 后端依赖 node-pty（原生模块，载荷无 android-arm64 产物；本工程无 NDK 链）。按宪法 C2 不做伪实现。解锁路径：aosp 侧编 node-pty/openpty 或上游出 JS backend seam | 无代码（阻塞登记） |
| P2-3 | fs.pickFiles/fs.saveFile | ✅ SAF 两段式：宿主能力 + PickDelegateActivity（OPEN_DOCUMENT/CREATE_DOCUMENT，结果拷 cacheDir 交 Node 可读路径；取消/异常槽位必收口） | HostCapabilities.kt、PickDelegateActivity.kt（新）、AndroidManifest.xml |
| P2-4 | clipboard readImage/writeText | ✅ Kotlin ClipboardManager：writeText（setPrimaryClip）；readImage（image/* clip → base64+mime+size） | HostCapabilities.kt |
| P2-5 | AgentKeepAlive | ✅ KeepAliveService（dataSync 前台，START_NOT_STICKY）+ power.keepAwake 能力 + notify 插件 running/idle 引用计数接线（多会话归零才停） | KeepAliveService.kt（新）、HostCapabilities.kt、notify-android/lib/index.js、AndroidManifest.xml、strings.xml |
| P2-6 | /_android/facts | ✅ 路径归名 /_ohos→/_android、插件名 facts-android；debug-only 门控（Kotlin DSH_ANDROID_FACTS 仅 debug 下发 '1'；bundle 行 `enabled: !!js …==='1'`） | facts-android/lib/index.js、README.md、bundle-android/cordis.patch.yml、DshRuntime.kt |

## 验证

- JS：`node --check` 三包通过
- Kotlin/Manifest：`gradlew :app:compileFullReleaseKotlin :app:processFullReleaseManifest`（结果见阶段报告）
- 设备回归：**受 keystore 外泄删除阻塞**（签名不一致无法 install -r；卸载重装会丢模型配置）——新代码设备验证待 keystore 恢复后执行；已装包上的 P1 取证不受影响（取证跑在既有构建上）

## 遗留/移交

1. keystore 恢复后：重装新构建 → 市场安装链回归（P1-4 需上游配合才闭环）→ keepalive/SAF/facts 设备取证
2. 上游反哺：plugin-manager feature-detect `desktopPnpm.lookup`（P1-4）；tool-fs-search 纯 JS 后端（206）
3. 真机复测全量（P1-5 清单）
