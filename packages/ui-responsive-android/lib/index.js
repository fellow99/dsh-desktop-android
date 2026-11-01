/**
 * `@dsh-android/ui-responsive` —— DSH Desktop（Android 版）的**响应式 UI 补丁**（Host 半边）。
 *
 * 问题：设置对话框是左右两栏（左 `<nav>` 栏目 + 右内容）。在手机竖屏（WebView 视口约 393px）下
 * 对话框面板宽约 345px，其中左栏目固定占 188px（≈54%），内容被明显挤压。
 *
 * 方案：**上游零补丁**，只经 dsh 的一等注入口 `webserver/index-inject` 下发一条 `style` 行（与
 * `@dsh-android/branding` 注入 HERO_CSS 同款机制，不新增基础设施）。窄屏（`max-width:600px`）下
 * 用纯 CSS 把对话框改为上下布局：标题一行、栏目变**顶部横向可滚动 tab 条**、内容区拿回整宽；
 * 宽屏（横屏/平板/桌面）保持上游左右两栏不变。
 *
 * 选择器纪律（抗上游升级）：只用**语义结构**（`[role="dialog"]` + 其后代 `<nav>` + `nav > div` +
 * `nav button`），**不**引用上游 CSS-modules 的哈希类名（如 `JnlPgW_nav`，会随上游重建变化）。
 * `:has()` 依赖 WebView ≥105（本工程 G-WV 门禁 ≥110，满足）。
 *
 * 边界：不改上游源码、不动业务逻辑；纯样式；规则严格限定在「含直接 `<nav>` 子元素的 dialog」，
 * 不波及其它弹层。上游若改设置对话框结构导致选择器不匹配，界面退回上游原样（不会误伤）。
 */

/** Cordis 插件名（与 bundle 行 id 一致）。 */
export const name = 'ui-responsive-android'

/** 只依赖 webServer：`webserver/index-inject` 是它的注入口。 */
export const inject = ['webServer']

/** 审计标记：出现在下发的样式里，便于对账。 */
export const RESPONSIVE_MARKER = 'DSH_ANDROID_UI_RESPONSIVE'

/**
 * 窄屏响应式规则（纯 CSS）。语义选择器 + `!important` 覆盖上游模块类。
 * 阈值 600px：手机竖屏（~393）触发，横屏（~850）与平板不触发。
 */
export const RESPONSIVE_CSS = `/* ${RESPONSIVE_MARKER}: 窄屏下设置对话框左侧栏目改顶部横向 tab 条（内容区取回整宽） */
@media (max-width: 600px) {
  /* 1) 面板：左右两栏 → 上下两段 */
  [role="dialog"]:has(> nav) { flex-direction: column; }

  /* 2) 栏目容器：整宽、去掉右分割线改底边线，高度自适应 */
  [role="dialog"]:has(> nav) > nav {
    width: auto !important;
    max-width: 100%;
    max-height: none !important;
    border-right: 0 !important;
    border-bottom: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.25));
  }

  /* 3) 栏目内的 tab 列表（nav 的最后一个 div）：纵向 → 横向可滚动条 */
  [role="dialog"]:has(> nav) > nav > div:last-child {
    flex-direction: row !important;
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    max-height: none !important;
    -webkit-overflow-scrolling: touch;
  }

  /* 4) 每个 tab：按内容宽度、不换行、不收缩 */
  [role="dialog"]:has(> nav) > nav button {
    width: auto !important;
    flex: 0 0 auto;
    white-space: nowrap;
  }

  /* 5) 内容区：拿回整宽并可纵向滚动 */
  [role="dialog"]:has(> nav) > *:not(nav) {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
  }
}
`

/**
 * 安装注入：把响应式样式作为 `style` 行推入 index.html 注入表。
 * @param {import('@deepseek-ai/cordis').Context} ctx - 带 `webServer` 服务的插件上下文。
 * @returns {void}
 */
export function apply(ctx) {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'style', text: RESPONSIVE_CSS })
  })
}
