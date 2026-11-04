# 012 · pnpm 集成（运行时装包）（spec.md）

> 状态：🔁 **已替换 → [112-cli-integration](./specs/112-cli-integration/)** ｜ 更新：2026-11-05
> 结论：本模块原为纯 JS pnpm 10.34.6（worker 线程 import）后端，已由 `112-cli-integration`
> 替换为 **aosp-pnpm-cli 真实 pnpm 二进制**（desktopPnpm 契约 install/lookup 成员保留，
> 内部由 worker import 改为 spawn `$HOME/bin/pnpm` → libpnpm_cli.so；pnpm 12+ 运行期依赖
> PATH 上 node，由 cli-env 农场保证）。

## 功能需求（替换后语义，详见 specs/112-cli-integration/spec.md FR-112-5）

- FR-110-1 → spawn 真实 pnpm 二进制（不再 worker import pnpm.cjs）
- FR-110-2 → 布局配置 nodeLinker hoisted + packageImportMethod copy 保留（host-boot 生成 pnpm-workspace.yaml）
- FR-110-3 → 单飞锁（BUSY_MESSAGE）保留
- FR-110-4 → 完成判据 = 子进程 exitCode；失败 127+DSH_PNPM_ENGINE 语义保留
- 纯 JS pnpm 引擎（dsh-market-pnpm）不再物化；assemble-payload 仅注记

## 验收与测试（指向 112）

- 用例：specs/112-cli-integration/test-cases.md TC-112-6；版本实证：Agent 上下文 `pnpm -v` = 12.16.1（logs/20261104-1）
