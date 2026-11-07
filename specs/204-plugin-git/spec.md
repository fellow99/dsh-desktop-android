# 204 · GIT 插件（spec.md）

> 状态：🔁 **已替换 → [112-cli-integration](./specs/112-cli-integration/)** ｜ 更新：2026-11-05
> 结论：本模块原为 isomorphic-git（纯 JS）21 工具后端，已由 `112-cli-integration` 替换为
> **aosp-git-cli 真实 git 二进制**，并在 **第二阶段修订（2026-11-05）** 把 21 个按动词封装的工具
> **精简为单一 `git` passthrough 工具**（LLM 已精通 git 命令；信封——围栏/凭据/执行器/设置页——保留）。
> isomorphic-git 闭包与全部纯 JS 残留模块已从载荷与源码移除。

## 功能需求（替换后语义，详见 specs/112-cli-integration/spec.md FR-112-4）

- FR-204-1 → 单一 `git` 工具，后端 = 真实 `git` 二进制（libgit_cli.so，http(s) 传输；argv 原样执行，
  工作目录=围栏裁决的仓库根；argv 护栏拒绝 `--git-dir`/`--work-tree`/`--exec-path`/`--separate-git-dir`/`--config-env=`）
- FR-204-2 → 凭据设置页 + `GIT_CREDENTIAL_<HOST>` 存储契约定点保留（lib/auth.js / git-credentials.js）；
  `git` 工具 spawn 前为 argv 内 http(s) URL 前置 mirror → `$HOME/.git-credentials`（0600）
- FR-204-3 → `git` 工具 init/commit/log/status/clone 真机实证（第一轮 logs/20261104-1；第二轮精简版 logs/20261105-1）

## 验收与测试（指向 112）

- 用例：specs/112-cli-integration/test-cases.md TC-112-5；证据：logs/20261104-1/evidence/ + logs/20261105-1/evidence/
