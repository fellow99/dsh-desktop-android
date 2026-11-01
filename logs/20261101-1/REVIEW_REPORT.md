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
