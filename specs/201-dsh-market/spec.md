# 201 · dsh-market 插件市场（spec.md）

> 状态：🟡 Partial（市场 UI/装卸链已就绪；G6 安装链 lookup 待上游 feature-detect，T-001）｜ 依据：docs/000-工程规划.md ｜ 源码落点：packages/market-android/（P3）
> 目标：desktopProfiles/desktopPnpm 契约对接与装/卸闭环（§5.2 #9）。
>
> **pnpm-cli 合规检查（2026-11-05，对应 specs/112-cli-integration FR-112-5）**：市场的装/卸链已走 **aosp-pnpm-cli 真实 pnpm 二进制**——
> `desktopPnpm` 交由 `packages/market-android/lib/pnpm-inprocess.js` `spawn` `DSH_PNPM_ENGINE`（=`$HOME/bin/pnpm` → `libpnpm_cli.so`）；
> 旧的 `pnpm-worker.mjs`（worker 线程 import pnpm.cjs）与随包纯 JS `dsh-market-pnpm` 引擎已**随 112 删除**（载荷内 ABSENT）。
> 设备实测（logs/20261104-1）：UI 安装 `dsh-session-superagent` 成功（node_modules + .pnpm-store/v11 落盘）；引擎级卸载
> `pnpm remove`（与桌面 uninstall 同调用）`Packages: -1` / `Done in 32ms using pnpm v12.16.1`，node_modules/deps 清洁。
> 早期 2026-11-01 的两条 as-built 修复记录（worker TMPDIR / reflink 存根）基于纯 JS 引擎，已随 112 失效，保留仅供历史参照。
>
> **as-built 修复记录（2026-11-01）**：设置→插件市场→「想要更快打开？可在侧栏显示」点「显示」报 `sidebar entry: HTTP 405`。
> 根因：`../dsh-market` 的构建产物 `lib/routes.js` 落后于 `src/routes.ts`（缺 `/dsh-market/sidebar-entry` 路由）。
> 修复：① 重建 dsh-market（`npm run build`）；② `scripts/assemble-payload.mjs` 的 `collectDshMarket()` 增
> `assertMarketBuilt()`（`src/*.ts` 新于 `lib/*.js` 即装配失败）——与 ark 同款，防再发残包。真机验证通过。
>
> **as-built 修复记录（2026-11-01，安装链；纯 JS 引擎时期，112 后已失效）**：插件市场点「确认安装」失败，报错栈落在 `dsh-market-pnpm/dist/pnpm.cjs`、
> `createNewStoreController`。完整错误（host stderr）：`Error: ENOENT: no such file or directory, lstat '/tmp'`，
> 来自 pnpm 的 `temp-dir` 在**模块加载时** `realpathSync(os.tmpdir())`——**Android 无 `/tmp`**。
> 修复（`packages/market-android/lib/pnpm-worker.mjs`，该文件 112 已删）：在 import pnpm 之前把 `TMPDIR/TMP/TEMP` 与 `os.tmpdir()`
> 指向 profile 下真实可写目录（`<profile>/.pnpm-cache/tmp`），并强制 `package-import-method=copy`（避开 reflink/hardlink）；
> 装配期额外物化 `@reflink/reflink-android-arm64` 存根（防御下一层 reflink require）。真机验证：安装 `dsh-unlag` 成功、
> 落盘 `profiles/android/node_modules/dsh-unlag`、卡片「✓ 已安装」。诊断增强：`pnpm-inprocess.js` 成功时把实际引擎命令/输出写 host 日志；
> 失败时把完整 worker stderr 写入 host 日志（市场 UI 只保留栈尾、丢消息首行）。

## 功能需求

- FR-201-1 market 1.67.0 随载荷内置（构建期常量+断言）
- FR-201-2 装/卸闭环：安装纯 JS 插件→激活→生效→卸载干净（G6）；**引擎已换为真实 pnpm 二进制**（112 FR-112-5，DSH_PNPM_ENGINE）
- FR-201-3 store 线市场只读

## 验收与测试

- 用例索引：G6
- 证据纪律：宪法 C3（截图/命令输出/JSON 为唯一判据）。
