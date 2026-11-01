# 201 · dsh-market 插件市场（spec.md）

> 状态：🟡 Partial（市场 UI/装卸链已就绪；G6 安装链 lookup 待上游 feature-detect，T-001）｜ 依据：docs/000-工程规划.md ｜ 源码落点：packages/market-android/（P3）
> 目标：desktopProfiles/desktopPnpm 契约对接与装/卸闭环（§5.2 #9）。
>
> **as-built 修复记录（2026-11-01）**：设置→插件市场→「想要更快打开？可在侧栏显示」点「显示」报 `sidebar entry: HTTP 405`。
> 根因：`../dsh-market` 的构建产物 `lib/routes.js` 落后于 `src/routes.ts`（缺 `/dsh-market/sidebar-entry` 路由）。
> 修复：① 重建 dsh-market（`npm run build`）；② `scripts/assemble-payload.mjs` 的 `collectDshMarket()` 增
> `assertMarketBuilt()`（`src/*.ts` 新于 `lib/*.js` 即装配失败）——与 ark 同款，防再发残包。真机验证通过。

## 功能需求

- FR-201-1 market 1.67.0 随载荷内置（构建期常量+断言）
- FR-201-2 装/卸闭环：安装纯 JS 插件→激活→生效→卸载干净（G6）
- FR-201-3 store 线市场只读

## 验收与测试

- 用例索引：G6
- 证据纪律：宪法 C3（截图/命令输出/JSON 为唯一判据）。
