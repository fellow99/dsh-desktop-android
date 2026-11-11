# 113 · 系统返回键行为 + 界面安全区适配（Android 版，spec.md）

> 状态：⬜ Planned（规格化）｜ 依据：需求 `113-system-back`（用户需求，2026-11-11）
> 源码落点：`app/src/main/kotlin/.../MainActivity.kt`、`ui/WebShellView.kt`、`res/values/themes.xml`、`packages/back-android/`、`packages/bundle-android/cordis.patch.yml`
> 宪法：C2 诚实降级 / C3 证据纪律 / C5 零补丁（上游源码）——本需求 seam 一律走 dsh 一等注入口 `webserver/index-inject`，不动上游。

## 一、问题陈述

### 1.1 系统返回键
当前 `MainActivity.onBackPressed()`（app/src/main/kotlin/org/fellow99/dsh/android/MainActivity.kt）：

```kotlin
override fun onBackPressed() {
    if (shell.canGoBack()) shell.goBack() else super.onBackPressed()
}
```

- WebView 首次加载后执行 `clearHistory()`（WebShellView.onPageFinished），故 `canGoBack()` 恒为 false；
- 结果：按系统 `返回` **总是** `super.onBackPressed()` → `finish()` → 退回桌面。

期望改为（需求原文，五条全判）：
| 场景 | 行为 |
|---|---|
| 设置页（Settings 对话框）| 退出设置页 |
| 弹出抽屉（窄屏侧栏 Drawer）| 收回抽屉 |
| 弹窗（Modal / Menu）| 关闭弹窗 |
| 首页（无活动会话）| 不做任何操作 |
| 会话页（活动会话）| 不做任何操作 |

即：系统返回键**永不退出应用、永不触发 WebView 历史后退**；只做"关闭最上层覆盖物"，无覆盖物时静默（首页/会话页）。

### 1.2 界面顶栏/底栏适配
真机（小米 M2105K81C / Android 11 / MIUI）现象：
- 界面"顶到"系统顶部状态栏，界面顶部两个按钮点不到；
- 触发聊天后，界面底部超出系统底部导航区（配置为「经典导航键」）；
- 期望：内容不占用顶部状态栏、不占用底部系统导航区；全面屏（挖孔/刘海/手势条）同步适配到安全区。

`targetSdk = 36`（Android 16 强制 edge-to-edge，API 35+ 默认内容绘制到系统栏之下）；MIUI 还有自有的状态栏着色行为。参考工程 `pi-desktop-android`（targetSdk 36、系统主题 `@android:style/Theme.Material.Light.NoActionBar`、无显式 inset 处理）无此问题 → 根因需在真机复现后确认（systematic-debugging：先复现、后下结论）。

## 二、决策：载荷是否修改？改的话用补丁还是插件？

**结论：需要修改载荷（在 Web UI 页面内运行 seam），采用「插件」方式，不用补丁。**

- 设置/弹窗的关闭语义由 dsh 前端 `useModalLayer`（`packages/client/ui-primitives/src/useModalLayer.ts`）持有：
  `[role="dialog"][aria-modal="true"]` 顶层弹层收到 `Escape` → 调 `onClose()` 关闭；设置面板（`ui-settings-general/src/client/SettingsRoot.tsx`）即 `role="dialog" aria-modal="true" data-shortcut-modal="settings"`，走同一机制收 Escape 关闭。
- 抽屉：`ui-layout/src/client/AppFrame.tsx` 在窄屏渲染 `[data-sidebar-mask]` 掩膜（`onClick` 关闭抽屉），frame 带 `data-sidebar-drawer`。
- 因此 seam 只需：**顶层弹层在 → 派发 Escape；否则抽屉展开 → 点掩膜；否则无操作**。dsh 前端无 `isTrusted` 守卫（已核实），合成键盘事件可触发其原生 `document` 监听。
- dsh 提供一等注入机制 `webserver/index-inject`，`kind: 'script'` 可在首页注入内联 `<script>`（`packages/client/web/src/apply-injections.ts` 已支持），三壳既有 seam 插件（branding / ui-responsive）为同款先例 → **插件方案零上游改动、抗上游升级**（选用语义选择器，不用 CSS-modules 哈希类名）。
- 宪法 C5 / FR-105：Android 适配层 `@dsh-android/bundle` 的 cordis.patch.yml 只允许三类操作，其中"插入本工程提供的行"即插件注入口。

## 三、功能需求

### FR-113-1 · 载荷 seam 注入（插件 `@dsh-android/back`）
- 新增 `packages/back-android/`（`name: @dsh-android/back`，`inject: ['webServer']`）；
- `apply(ctx)` → `ctx.on('webserver/index-inject', table => table.push({ kind: 'script', placement: 'head', text: <SEAM_JS> }))`；
- SEAM_JS 须：
  - 幂等：`window.__dshSystemBack` 已存在则不再覆盖；
  - 暴露 `window.__dshSystemBack(): boolean`（返回 true=已消费并执行了关闭；false=无覆盖物可关，即首页/会话页）；
  - 定义关闭优先级：顶层 `[role="dialog"][aria-modal="true"]`（含设置/通用弹窗）→ 派发 `Escape`；否则 `[data-sidebar-mask]` 且 frame 带 `[data-sidebar-drawer]` → `mask.click()`；否则 false；
  - 不引用上游 CSS-modules 哈希类名，只用语义属性/角色（抗上游重建，同 ui-responsive-android 纪律）。

### FR-113-2 · 系统返回键拦截（Kotlin 壳）
- `MainActivity.onBackPressed()` 改为**总是消费**：调用 `shell.handleSystemBack()`，不调用 `super.onBackPressed()`（应用不因返回键退出）；
- `WebShellView.handleSystemBack()`：`webView?.evaluateJavascript("(window.__dshSystemBack?window.__dshSystemBack():false)", null)`；webView 未就绪时静默（无操作）；
- 保留 `canGoBack()/goBack()` 不用于返回键（WebView 历史由 Web UI 自己管理，清栈策略不变）。

### FR-113-3 · 界面安全区适配（Android）
- 根视图 `WebShellView` 应用 `setOnApplyWindowInsetsListener`：按系统栏 + 显示区域（DisplayCutout）insets 给根视图 `setPadding(left, top, right, bottom)`；
- API 30+：`window.setDecorFitsSystemWindows(false)`（显式 edge-to-edge 后自行垫安全区，兼容 Android 16 强制 edge-to-edge）；API 26–29：用 `systemWindowInset*` 回退；
- `requestApplyInsets()` 确保各版本均触发；
- 效果：内容不绘制到状态栏之下、不越过底部导航区；全面屏（挖孔/手势条）以 inset 自动留出安全区；
- 不引入 androidx 依赖（本项目为纯 framework，检视 build.gradle 确认）。

### FR-113-4 · 返回键不退出（约束）
- 任何阶段（含 loading/error 覆盖层）系统返回均被消费、不 `finish()`；
- 退出应用仅保留：最近任务划走 / 错误页「重启应用」（既有行为，不新增）。

## 四、验收与测试
- 用例：本目录 `test-cases.md`（真机 L1）；
- 门禁：`./gradlew assembleFullDebug` 通过；`lsp_diagnostics` 无新增错误；
- 证据纪律：宪法 C3 —— 截图 / `adb shell uiautomator dump` / logcat 为唯一判据（真机 8f155833）。

## 五、边界
- 仅改返回键语义与安全区；不改 WebView 矩阵、导航围栏、错误页、启动编排；
- 抽屉关闭仅针对窄屏展开态；宽屏静态侧栏不参与（无 `data-sidebar-mask`/`data-sidebar-drawer`）。
