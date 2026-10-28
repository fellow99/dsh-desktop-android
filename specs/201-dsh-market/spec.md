# 201 · dsh-market 插件市场（spec.md）

> 状态：⬜ Planned ｜ 依据：docs/000-工程规划.md ｜ 源码落点：packages/market-android/（P3）
> 目标：desktopProfiles/desktopPnpm 契约对接与装/卸闭环（§5.2 #9）。

## 功能需求

- FR-201-1 market 1.67.0 随载荷内置（构建期常量+断言）
- FR-201-2 装/卸闭环：安装纯 JS 插件→激活→生效→卸载干净（G6）
- FR-201-3 store 线市场只读

## 验收与测试

- 用例索引：G6
- 证据纪律：宪法 C3（截图/命令输出/JSON 为唯一判据）。
