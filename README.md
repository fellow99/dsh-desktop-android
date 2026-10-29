# dsh-desktop-android

**DSH Desktop（Android 版）** — 在 Android 上以「进程内 Node + 系统 WebView」运行 [deepseek-harness](../deepseek-harness)（dsh）的桌面交付。

- **版本**：0.1.0（`versionCode` 1）｜ 上游基线 `dsh-v0.2.1-rc.2` ｜ 引擎 libnode **v24.22.1**（small-icu）
- **技术栈**：Kotlin（View 体系）· 系统 WebView · 进程内 `libnode.so`（`node::Start`，JNI 槽位表桥）· dsh Host（HTTP + WebSocket）
- **适配原则**：上游**零补丁** —— `android` profile + `@dsh-android/bundle`（三类 patch 操作）+ 带标记垫片/物化期补丁 + 自建 seam 插件（`packages/*-android`）

## 运行模型

```
MainActivity（前台 UI）
  └─ DshRuntime：进程内启动 libnode → dsh Host（仅监听 127.0.0.1:<随机端口>）
  └─ WebShellView（WebView）→ 加载 http://127.0.0.1:<port>/?token=<一次性 token>
  └─ HostCapabilities：Kotlin↔Node 能力桥（冻结名 17 项，JSON 进出、handler 永不抛）
  └─ KeepAliveService：agent turn 运行期 dataSync 前台保活（结束即停）
```

## 快速开始

```bash
# 1. 载荷装配（物化上游 dsh 运行树 + 本工程 packages/* + bundle patch + 垫片）
node scripts/assemble-payload.mjs --deploy --apply
# 2. 打包载荷 → app/src/main/assets/dsh-payload/{dsh.tar,dsh.version}
node scripts/package-payload.mjs --src build/payload-stage/root
# 3. 引擎投放（libnode.so，锁 sha256，八项 ELF 门禁）
node scripts/provision-engine.mjs
# 4. 构建（full=侧载线含 All-files；store=SAF-only 线）
./gradlew assembleFullDebug        # 模拟器/侧载调试
./gradlew assembleFullRelease      # 发布候选（需签名配置）
# 5. 部署
adb install -r app/build/outputs/apk/full/debug/app-full-debug.apk
```

环境前置（D.3 核对单）：IANA 时区（GMT 偏移名会被拒绝）、Android 13+ 需 POST_NOTIFICATIONS、All-files 授权（文档/下载 tab）、arm64-v8a 引擎（x86_64 模拟器需 ARM 转译镜像）。详见 [docs/安卓环境能力清单-v0.2.1.md](docs/安卓环境能力清单-v0.2.1.md) §D.3。

## 仓库结构

| 路径 | 内容 |
|---|---|
| `app/` | Kotlin 外壳：`DshRuntime`（启动状态机）、`WebShellView`、`host/HostCapabilities`（能力桥）、`host/KeepAliveService`（保活）、`host/PickDelegateActivity`（SAF 两段式） |
| `packages/` | Node 侧 seam 插件：`bundle-android`（patch）、`subprocess-android`（含进程内 rg 替身）、`shell-android`（哨兵协议 shell）、`market-android`（desktopPnpm 契约+lookup）、`git-android`（21 工具）、`notify-android`（通知+保活接线）、`facts-android`（`/_android/facts`，debug-only）、`workspace-picker-android(+client)`、`open-in-app-android`、`attachment-image-android`、`sandbox-android` |
| `payload/` | 正式载荷入口：`bootstrap.js`（env 断言/垫片登记）+ `host-boot.js` + `shims/`（S1–S5） |
| `profiles/android/` | `android` profile（bundle 引用、npmrc） |
| `scripts/` | `assemble-payload.mjs` / `package-payload.mjs` / `provision-engine.mjs` |
| `specs/` | 规格文档体系（ Constitution C1–C14 + overall-* + 000/101–109/012/201–206 模块 spec/plan） |
| `docs/` | 工程规划、P0 门禁报告、安卓环境能力清单（能力矩阵 42 项 + D.2 待办）、**任务登记册（020）** |
| `logs/` | 执行轮日志与取证证据（`<YYYYMMDD>-<N>/evidence/`） |

## 关键文档

- [docs/000-工程规划.md](docs/000-工程规划.md) — 总体规划与实现状态
- [docs/010-P0门禁报告.md](docs/010-P0门禁报告.md) — 三阶段门禁（G4 Intl 定论 → 复测 → P2/P3 落地）
- [docs/安卓环境能力清单-v0.2.1.md](docs/安卓环境能力清单-v0.2.1.md) — 与 ark/hos 三路同表的能力矩阵与待办
- [docs/020-任务登记册.md](docs/020-任务登记册.md) — 全部待办的编号登记（T-001…）
- [specs/README.md](specs/README.md) — 规格索引；[specs/constitution.md](specs/constitution.md) — C1–C14 宪法（诚实降级/零补丁/不伪造）

## 已实证能力速览（2026-10-29）

对话与图片分析 ✅ ｜ bash 端到端 ✅ ｜ git clone/push（http(s)）✅ ｜ 通知（回合完成/审批）✅ ｜ Documents/Download 写入 ✅ ｜ `/_android/facts`（debug）✅ ｜ AgentKeepAlive 生命周期 ✅ ｜ grep/glob（进程内 rg 替身）✅（本仓库实现）｜ PTY ⛔（node-pty 原生依赖，暂缓）｜ 真机复测 ⏸（暂缓）
