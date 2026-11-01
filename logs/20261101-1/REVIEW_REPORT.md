# REVIEW_REPORT · 111-pty-integration

> 日期：2026-11-01 ｜ 评审范围：`5cb7387..f5b0804`（+ terminal.js 随后的 `.settled` 修复）
> 评审方式：requesting-code-review（审查产物 + 契约比对）→ receiving-code-review（逐条验证/反驳）

## 评审摘要

实现了 PTY 三件套接入（runtime/pty AAR）、S6 垫片、`AndroidTerminalHandle` + `spawnTerminal`、终端两行解禁。
本地 `assembleFullDebug` 全绿（5 .so 入包）；subprocess smoke/code-check 通过。核心实现假设（node-pty
加载复用）尚待设备端实证（诚实登记）。

## 分级意见

### Critical（立即修）
- 无。

### Important（合并且必改）
1. **[已修]** `AndroidTerminalHandle.closeOnce` 引用 `this.outcome.settled` —— `Promise.withResolvers` 无
   `settled` 属性，恒为真，逻辑走通但非意图；且若 done 已 settle 仍会再 resolve。改为 `if (!this.exited)`
   守卫 + 显式 resolve（避免对已 settle promise 重复 resolve 的歧义）。

### Minor（记录，暂不修）
2. **[记录/风险]** `terminate()` 只杀 PTY 顶层 shell，不枚举其后代进程。上游用 ProcessInspector 进程组/
   会话群杀；Android 无该检查器。关闭 PTY master 时 tty 挂起（SIGHUP）会向会话前台上发信号，能覆盖大部分
   场景；但前台独立进程（如 `nohup sleep`）可能残留。本期按"基础能力优先"接受，登记为已知边界，非伪造。
3. **[记录]** `signalForeground`/`inspectForeground` 返回 unsupported/undefined —— 面板交互 Ctrl-C 走
   `write('\x03')` 输入通道（tty 驱动发 SIGINT 到前台组），不依赖这两个方法；故不影响交互，属诚实降级。
4. **[记录]** bundle 的 `terminal-controller` 加 `maxCols:400/maxRows:120` 属有效 schema 覆写（上游
   min2/min1 默认 500/200），无拒绝风险；保留。

### 被驳回/无需改
- 无外来建议；自审未发现需推翻的实现。

## 结论

无 Critical；1 项 Important 已修；其余为诚实登记的边界与风险（C2/C3 一致）。可进入 Testing。

---

## 追加评审（修复提交 f2c3cdb / eee0ba6 之后）

**范围**：B1–B6 六个真机暴露缺陷的修复 + 装配期可复现性。

### 结论
- 无 Critical。修复均在真机上端到端复验（可复现管线：`assemble --deploy --apply → package → assembleFullDebug → install → 终端 echo` 通过）。
- **Important（已处理）**：node-pty JS/原生版本错配必须在装配期固化——已加 `ensureNodePtyJsVersion`（NODE_PTY_JS_VERSION=1.1.0，npm pack）与 `patchNodePtyNativeLoad`（MARK 幂等 + 锚点硬失败），并重跑 `--deploy --apply` 验证（日志：`node-pty JS 1.2.0-beta.15 → 1.1.0`、`补丁 111：… process.dlopen`）。
- **Minor（已修）**：`payload/shims/s6-node-pty.js` 移除 symlink 方案遗留的死代码（`ptyPackageRoot`/`REL_TARGET`）。
- **记录/接受**：
  - `useLegacyPackaging=true` 的取舍（换取 nativeLibraryDir 实体可执行件；16KB 对齐不受损，安装盘占用增大）已入注释与 TEST_REPORT。
  - `signalForeground/inspectForeground` 不作为（诚实降级，Ctrl-C 走输入通道）。
  - `read_image` 首调失败重试成功（未复现根因，登记待观察）。

### 门禁
无 Critical，Important 已闭环 → 通过，进入回归（已用可复现管线端到端回归）。
