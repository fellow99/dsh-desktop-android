# 204 · GIT 插件（21 工具）（spec.md）

> 状态：🔁 **已替换 → [112-cli-integration](./specs/112-cli-integration/)** ｜ 更新：2026-11-05
> 结论：本模块原为 isomorphic-git（纯 JS）21 工具后端，已由 `112-cli-integration` 替换为
> **aosp-git-cli 真实 git 二进制**（21 工具名称/入参/输出 Schema/渲染保持不变，内部经
> `@dsh-android/git/lib/git-exec.js` 委托 `git`）。isomorphic-git 闭包已从载荷移除。

## 功能需求（替换后语义，详见 specs/112-cli-integration/spec.md FR-112-4）

- FR-204-1 → 21 个 git 工具，后端 = 真实 `git`（libgit_cli.so，http(s) 传输；凭据走
  `credential.helper=store --file=$DSH_HOME/.git-credentials`，0600）
- FR-204-2 → 凭据设置页 + `GIT_CREDENTIAL_<HOST>` 存储契约定点保留（lib/auth.js / git-credentials.js）
- FR-204-3 → clone/status/commit/push/init/log 真机实证（2026-11-05，logs/20261104-1/TEST_REPORT.md）

## 验收与测试（指向 112）

- 用例：specs/112-cli-integration/test-cases.md TC-112-5；证据：logs/20261104-1/evidence/
