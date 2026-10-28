# P1/P2 执行任务分解与验收标准（logs/20261029-1/TASK_BREAKDOWN.md）

> **日期**：2026-10-29 ｜ **依据**：`docs/安卓环境能力清单-v0.2.1.md` §D.2
> **执行模式**：连续执行（六阶段）｜ **需求目录**：按用户决策不新建需求编号，产物归入既有模块 spec 目录与本日志目录
> **取证环境**：模拟器 Medium_Phone_API_37.0（emulator-5554，x86_64 + ARM 转译，时区 Asia/Shanghai）
> **限制登记**：应用非 debuggable（run-as 不可用）→ 取证通道 = 启动应用 + logcat 桥日志 + CDP（WebView DevTools）驱动 + screencap 截图

## P1（取证/阻塞）

| # | 任务 | 验收标准 | 方法 |
|---|---|---|---|
| P1-1 | bash 单命令端到端取证 | 会话内经 bash 工具执行 `echo` 得到正确 stdout，桥日志无 EACCES；证据 = logcat 行 + 截图 | CDP 发消息驱动 agent bash 工具 |
| P1-2 | grep/glob 纯 JS 后端取证 | 工作区内一次内容搜索 + 一次 glob 返回正确结果，纯 JS 后端（无 rg）路径打通；性能若异常按 G13 缩范围并登记 | 同上，驱动 tool-fs-search |
| P1-3 | git clone/push 端到端 | clone 一个公开仓库到工作区成功（21 工具已注册）；push 受凭据限制则如实登记 | 同上，驱动 @dsh-android/git |
| P1-4 | G6 安装链 lookup 修复 | `@dsh-android/market` desktopPnpm 契约补 lookup 成员（worker 跑 `pnpm view`，受 W^X A10 限制不走 PATH 垫片）；编译通过 + 市场安装对话框 lookup 不再 ENOENT | 代码修复 + 重装回归 |
| P1-5 | 模拟器全量取证 + 真机登记 | 引擎/时区/授权核对单（D.3）过一遍；文档/下载写入闭环、通知亮屏取证；**真机项登记为遗留待办** | adb + CDP + 截图 |

## P2（功能补齐）

| # | 任务 | 验收标准 |
|---|---|---|
| P2-1 | 删除/移动/复制/chmod 兜底 | 上游 ctx.fs L4 缺原语：bash 可用（P1-1 通过）后由模型兜底 rm/mv/cp；按基准工程补丁评估物化期补丁方案并登记结论 |
| P2-2 | PTY 完整终端 | 实现 openpty（/dev/ptmx 探针已过）→ terminal-controller/ui-sidebar-terminal 解禁；编译通过 + 面板可用 |
| P2-3 | fs.pickFiles/fs.saveFile（SAF 两段式） | 两段式框架（perm.request 同款）+ SAF intent；编译通过 + 基本路径可用 |
| P2-4 | 剪贴板 readImage/writeText | Kotlin ClipboardManager + ImageDecoder；编译通过 |
| P2-5 | AgentKeepAlive 前台服务 | turn 期间 dataSync 保活、结束即停；编译通过 + logcat 取证 |
| P2-6 | /_android/facts 诊断端点 | packages/facts-android 打开（debug-only）并接入 107 诊断；编译通过 + HTTP 取证 |

## 阶段门禁

1. Specification：本文件 ✅
2. Development：P1-1→P1-3 取证 → P1-4 + P2 代码实现 → 编译重装
3. Code Review：requesting-code-review 派发审查 → REVIEW_REPORT.md → receiving-code-review 处置
4. Testing/Regression：重装后全量回归取证 → TEST_REPORT.md
5. 每阶段完成按规范前缀提交（`specification:` / `development:` / `code-review:` / `code-review-fix:` / `testing:` / `regression:`）
