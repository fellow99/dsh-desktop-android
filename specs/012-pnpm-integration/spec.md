# 012 · pnpm 集成（运行时装包）（spec.md）

> 状态：⬜ Planned ｜ 依据：docs/000-工程规划.md ｜ 源码落点：packages/market-android/（P3）
> 目标：内置纯 JS pnpm 10.34.6 + worker 调用器（§7.3）。

## 功能需求

- FR-012-1 worker_threads 内 import(pnpm.cjs)；不 spawn（A10）
- FR-012-2 布局：nodeLinker hoisted + packageImportMethod copy + ignoreScripts
- FR-012-3 单飞：并发同步抛 another desktop pnpm operation…
- FR-012-4 完成判据=worker exitCode；cancel=terminate；失败 127+DSH_PNPM_ENGINE

## 验收与测试

- 用例索引：G6（P3）
- 证据纪律：宪法 C3（截图/命令输出/JSON 为唯一判据）。
