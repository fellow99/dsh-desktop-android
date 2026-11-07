# REVIEW_REPORT · 112-cli-integration 第二阶段修订（git 工具族精简 + 110/201 复核）

> 评审范围：`packages/git-android` 精简（21 工具 → 单一 `git` passthrough）、`assemble-payload.mjs` 死代码清理、
> 110/201 合规复核、对应规格/spec 修订。评审方式：requesting-code-review 纪律（按目录对源码核实，不表演性认同）。

## 结论

- **Critical 0**；**Important 1**（已修复，见下）；**Minor 若干**（记录）。
- 核心取舍确认：LLM 已精通 git 命令，21 个按动词工具冗余；精简后保留围栏/凭据/执行器/设置页信封，安全属性零损失。

## Important（已处理）

| # | 项 | 核实 | 处置 |
|---|---|---|---|
| I-1 | **认证失败消息不区分「未配置」/「被拒」**：passthrough 原先一律报 `missingMessage`（"no credentials configured"），存量凭据被服务器拒绝时措辞误导 | `GitCredentials.rejectedMessage()` 已存在但无人消费；`storeLookup` 可判定 | ✅ 已修复（`tools/git.js` execute：`storeLookup` 命中→`rejectedMessage`，否则→`missingMessage`） |

## Minor（记录）

- M-1 `git bisect run <cmd>` 可在仓库内执行 shell（与 bash 工具同级信任，非提权；argv 经 spawn 无 shell 注入面）——记录，不设防。
- M-2 `-c name=value` 允许模型为单命令覆盖 config（含 `core.hooksPath`）；hooks 依赖 filesDir noexec 无法执行；`core.pager=cat` 已由 git-exec 兜底。
- M-3 fetch/pull/push 用**远端名**时 argv 内无 URL，前置 mirror 只覆盖含 URL 的命令；host 级凭据在首次 URL 操作后已全量入文件，影响有限。
- M-4 工具类输出全部文本（stdout/stderr），绝无结构装配开销——符合「模型自己读」定位。
- M-5 `guardArgv` 对 `--separate-git-dir` 一并禁用（保守），保留 `-C <根内相对/绝对>` 合法用法。

## 设备验证（真机 8f155833，payload 547d30bbadb0，dsh 0.2.1-rc.5）

- ✅ `@dsh-android/git: registered 1 tool (git passthrough)`（schema 校验通过，无 minItems 报错）。
- ✅ cli-env：node 26.13.0 / git 2.56.0 / python 3.14.10 / pnpm 12.16.1 / uv 0.13.6；农场 18 条软链。
- ✅ git 执行层（runGit 同款参数）：init→add→commit(c20582d)→status clean→log，全部 exit 0；credential.helper=store 接线正常。
- ⚠️ **Web 全量 UI 启动被上游阻塞**（与本评审无关）：`dsh-client-ui-trajectory` client inject `remote.toolResults`，rc.5 无提供方 → `web boot: 1 entry did not activate`。Agent 驱动 git 工具的 L2 端到端因此未能在本轮跑通；执行层证据见 `evidence/device-git-passthrough-exec.txt`。

## 110 / 201 合规复核

- **110-pnpm-integration**：✅ 已合规（`pnpm-inprocess.js` spawn 二进制 + `DSH_PNPM_ENGINE=$HOME/bin/pnpm` + 单飞锁 + exitCode 判据 + 布局配置；纯 JS pnpm/worker 已移除）。前轮真机 install/uninstall 实证。
- **201-dsh-market**：✅ 装/卸链已走桌面 pnpm 契约→真实 pnpm 二进制；spec 增补 2026-11-05 as-built 记录（`pnpm-worker.mjs` 已删、TMPDIR/reflink 旧修复失效仅存史）。前轮 UI 安装 + 引擎卸载实证。

## 敏感信息

- 评审未发现 KEY/口令写入任何规格/日志/证据文件；测试 KEY 仅设备 UI 会话内注入（本轮未注入）。
