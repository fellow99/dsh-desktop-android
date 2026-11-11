# 113 · 系统返回键行为 + 界面安全区适配（Android 版，plan.md）

> 对应：`specs/113-system-back/spec.md` ｜ 状态：⬜ Planned

## 一、方案要点

1. **载荷侧（seam 插件）**
   - 新增 `packages/back-android/`：`package.json`（`@dsh-android/back`，`type: module`，`main/exports → lib/index.js`）+ `lib/index.js`（`name`/`inject`/`apply`）+ `lib/seam.js`（SEAM_JS 源码，供 index.js 内联进注入表）。
   - `packages/bundle-android/cordis.patch.yml` 的 `- insert:` 追加一行 `- id: back-android / name: '@dsh-android/back'`。
   - 装配由 `scripts/assemble-payload.mjs` 自动物化（扫描 `packages/*-android/`，`manifest.name` 前缀 `@dsh-android/` 即物化到 `node_modules/@dsh-android/back`），FR-105-005 自动校验 insert 行可解析 → 必须物化成功才能通过装配。

2. **Kotlin 壳侧**
   - `MainActivity.onBackPressed()`：始终 `shell.handleSystemBack()`，不 `super.onBackPressed()`。
   - `WebShellView` 增加 `handleSystemBack()`：`evaluateJavascript` 调用 `window.__dshSystemBack()`（防御式存在性判断）。

3. **界面安全区适配**
   - `MainActivity.onCreate`：`WindowCompat` 语义用 framework 等效实现——API 30+ `window.setDecorFitsSystemWindows(false)`，否则 `SYSTEM_UI_FLAG_LAYOUT_*`；
   - `WebShellView`（根 FrameLayout）`setOnApplyWindowInsetsListener`：`systemBars() + displayCutout()` insets → `setPadding`；API<30 用 `systemWindowInset*` 回退；
   - `requestApplyInsets()`。

4. **真机复现与取证（systematic-debugging 顺序）**
   - 修改前：装当前包 → 截图 + `uiautomator dump`（确认顶栏两按钮坐标 vs 状态栏高度、会话页底部 vs 导航区）→ 记录基线根因；
   - 实现后：复检同场景，断言顶/底不再重叠、按钮可点。

## 二、风险与对策

| 风险 | 对策 |
|---|---|
| 合成 `Escape` 事件未触发 `useModalLayer` 关闭 | 前端已核实无 `isTrusted` 守卫；若真机不生效，回退为「模拟点击设置面板关闭按钮/掩膜」，见 tasks 备用路径 |
| MIUI 状态栏行为与 AOSP 不同 | 以真机 `uiautomator dump` 实测 inter 判定，不以样式猜测 |
| API<30 回退路径 inset 取值偏差 | L1 用例显式覆盖 Android 11 真机（API 30 即为分界点）+ 代码走 API30 分支 |
| 抽屉检测误判 | 用 `[data-sidebar-drawer]`（frame 属性）+ `[data-sidebar-mask]` 双重判定，且仅在顶层无弹层时执行 |

## 三、改动文件清单

| 文件 | 动作 |
|---|---|
| `packages/back-android/package.json` | 新增 |
| `packages/back-android/lib/index.js` | 新增（插件宿主半边）|
| `packages/back-android/lib/seam.js` | 新增（页面 seam JS，作为字符串注入）|
| `packages/back-android/README.md` | 新增（插件说明，审计标记）|
| `packages/bundle-android/cordis.patch.yml` | insert 行追加 `back-android` |
| `app/src/main/kotlin/.../MainActivity.kt` | onBackPressed 改造 + inset 监听安装 |
| `app/src/main/kotlin/.../ui/WebShellView.kt` | `handleSystemBack()` 新增 |
| （视实测）`app/src/main/res/values/themes.xml` | 仅当 inset 方案不足以表达安全区时微调 |
