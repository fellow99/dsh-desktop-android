# @dsh-android/ui-responsive

DSH Desktop（Android 版）的**响应式 UI 补丁**（Host 半边，纯 CSS 注入，上游零补丁）。

## 解决什么

设置对话框是左右两栏（左 `<nav>` 栏目 + 右内容）。手机竖屏（WebView 视口约 393px）下，
对话框面板约 345px，左栏目固定占 188px（≈54%），内容被明显挤压。

## 怎么做

经 dsh 一等注入口 `webserver/index-inject` 下发一条 `style` 行（与 `@dsh-android/branding`
注入 HERO_CSS 同款机制）。窄屏（`max-width:600px`）下用**纯 CSS** 把对话框改为上下布局：

- 面板 `flex-direction: row → column`；
- 栏目 `<nav>` 变顶部条（整宽、底部细线）；
- 栏目 tab 列表由纵向 → **横向可滚动 tab 条**；
- 内容区取回整宽并可纵向滚动。

宽屏（横屏/平板）保持上游左右两栏。

## 选择器纪律（抗上游升级）

只用**语义结构**：`[role="dialog"]:has(> nav)`、`nav > div:last-child`、`nav button`；
**不**引用上游 CSS-modules 哈希类名（如 `JnlPgW_nav`，上游重建即变）。`:has()` 依赖 WebView ≥105
（本工程 G-WV 门禁 ≥110）。规则严格限定「含直接 `<nav>` 子元素的 dialog」，不波及其它弹层；
上游若改结构导致不匹配，界面退回上游原样。

## 边界

不改上游源码、不动业务逻辑；纯样式。挂载行见 `@dsh-android/bundle` 的 `cordis.patch.yml`
（`ui-responsive-android`）。
