# @dsh-android/back —— 系统返回键 seam（Android 版）

> 需求：`specs/113-system-back/` ｜ 审计标记：`DSH_ANDROID_SYSTEM_BACK`

## 是什么

ds 侧（Host 半边）插件：经 dsh 一等注入口 [`webserver/index-inject`](../../../deepseek-harness/packages/client/web/src/apply-injections.ts) 下发一条 `kind:'script'` 页面脚本身，让系统「返回」键在 Web UI 内按上下文执行：

| 场景 | seam 行为 |
|---|---|
| 顶层弹层（设置页 / 通用对话框 / 菜单） | 派发 `Escape` → dsh `useModalLayer` 关闭最上层 |
| 窄屏侧栏抽屉展开 | 点击 `[data-sidebar-mask]` 掩膜收回 |
| 首页 / 会话页 | 无操作（返回 `false`） |

页面对外只暴露一个函数：`window.__dshSystemBack(): boolean`（`true`=已执行关闭；`false`=无覆盖物）。

## 机制与纪律

- **上游零补丁**：不新增基础设施、不改上游源码，与 `@dsh-android/branding` / `@dsh-android/ui-responsive` 同款注入机制。
- **选择器纪律（抗上游重建）**：只用语义属性/角色（`[role="dialog"][aria-modal="true"]`、`[role="menu"]`、`[data-sidebar-drawer]`、`[data-sidebar-mask]`、`inert`）与既有 `[class*=_centerCol]/[class*=_sidebarCol]` 稳定结构类（AppFrame CSS module 后缀），不引用完整哈希类名。
- **不依赖 DOM 时机**：seam 仅定义函数，状态判定发生在其被调用时。

## 接线

- `packages/bundle-android/cordis.patch.yml` 的 `- insert:` 追加行 `- id: back-android / name: '@dsh-android/back'`。
- 装配：`scripts/assemble-payload.mjs` 自动把 `packages/*-android/` 物化到 `node_modules/@dsh-android/`，并由 FR-105-005 校验 insert 行可解析。
- Kotlin 壳：`MainActivity.onBackPressed` → `WebShellView.handleSystemBack()` → `evaluateJavascript("window.__dshSystemBack()")`。

## 验证

- 真机 L1 用例见 `specs/113-system-back/test-cases.md`（TC-113-1..7）。
- 页面 seam 可通过 CDP（`chrome://inspect`，debug 构建）直接调用 `window.__dshSystemBack()` 断言设置/抽屉/弹窗关闭与首页/会话无操作。
