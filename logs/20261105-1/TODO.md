# 112-cli-integration 第二阶段：git 工具族精简 + 110/201 合规复核（TODO）

> 阶段目标：把 `@dsh-android/git` 从 21 工具精简为 1 个 `git` passthrough（保留围栏/凭据/执行器信封），
> 修订进 112 spec；复核 110-pnpm-integration 与 201-dsh-market 合规 pnpm-cli / dsh-market+pnpm-cli；执行开发+测试。

- [x] S1 修订 `specs/112-cli-integration/spec.md` FR-112-4（21 工具 → `git` passthrough；FR-112-4a/b/c/d/e 重写）
- [x] S2 更新 `plan.md`（D6 节）、`tasks.md`（US3 任务 T016-T021 重写）、`test-cases.md`（TC-112-5 重写）
- [x] S3 复核 110-pnpm-integration：代码=spawn 二进制/DSH_PNPM_ENGINE/纯JS已除 → 已合规（前轮真机实测）；回填 spec 结论
- [x] S4 复核 201-dsh-market：市场装卸链走 desktopPnpm→二进制 pnpm；201 spec 增补 as-built 记录（pnpm-worker.mjs 已删 → 二进制形态）；实测复核
- [x] S5 实现精简 git：
  - [ ] 新增 `lib/tools/git.js`：单一 `git` 工具（argv/dir/timeout_ms + 升级字段）；fence.open 解析仓库根；argv 护栏（--git-dir/--work-tree/--exec-path 拒绝、-C 越界拒绝）；凭据前置 mirror（argv 内 URL → credentials.lookup）
  - [ ] 重写 `lib/index.js`（注册 1 工具）；裁剪 `lib/fence.js`（去 fs-adapter/createRepositoryFs/isMissingRepository）+ `lib/toolkit.js` 内联；`lib/auth.js` 去 callbacks()（保留 lookup/mirror/missing/rejected）
  - [ ] 删除 21 工具 + `toolkit.js`/`report.js`/`diff.js`/`fs-adapter.js`/`merge-worktree.js`/`runtime.js`
  - [ ] `git-exec.js` 增 `-c core.pager=cat`；README/package.json 描述更新；bundle-android 注释更新
- [x] S6 静态检查：`node --check` 全部改文件 + grep 无孤儿 import
- [x] S7 构建 `assembleFullDebug` + `adb install` 真机
- [ ] S8 真机测试：（⚠ 被上游 rc.5 web boot 阻塞：trajectory/remote.toolResults，与 112 无关；见证据 device-git-passthrough-exec.txt）
  - [ ] 工具表：仅 `git`（非 21）；devtools 会话注册日志核对
  - [ ] git e2e：`git init`→写文件→`git add -A`→`git commit`→`git log`→`git status`（Agent 经 `git` 工具）
  - [ ] 凭据 mirror：设置页存 GIT_CREDENTIAL_<HOST> → 前置 mirror 写入 .git-credentials（0600）
  - [ ] argv 护栏：`--git-dir=/proc` 拒绝；`-C /sdcard` 拒绝
  - [ ] 110/201：Market pnpm install/uninstall 复核（二进制 DSH_PNPM_ENGINE）
  - [ ] L2 快速回归（UI 加载 / API KEY / 一次对话）
- [ ] S9 回填 TEST_REPORT.md；敏感信息扫描（API KEY 不入盘）；specs/README.md（T-023）更新；codegraph sync
- [ ] S10 子模块提交 + 父工程指针提交（Conventional Commits）

> 纪律：不落任何 API KEY/口令；测试 KEY 仅在设备 UI 会话内注入；只改本工程。
