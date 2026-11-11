/**
 * `@dsh-android/back` —— DSH Desktop（Android 版）系统返回键 seam（Host 半边）。
 *
 * 作用：经 dsh 一等注入口 `webserver/index-inject` 下发一条 `kind:'script'` 页面脚本，
 * 让系统「返回」键在 Web UI 内按上下文执行（specs/113-system-back）：
 *   - 顶层弹层（设置页 / 通用对话框 / 菜单）→ 关闭；
 *   - 否则窄屏侧栏抽屉展开 → 收回；
 *   - 否则（首页 / 会话页）→ 不做任何操作。
 *
 * 上游零补丁：与 `@dsh-android/ui-responsive` 同款机制与纪律——只用语义属性/角色与既有
 * `[class*=_centerCol]/[class*=_sidebarCol]` 结构类（AppFrame 的 CSS module 稳定后缀），
 * 不引用完整哈希类名，抗上游重建。
 *
 * 配套 Kotlin 壳：`MainActivity.onBackPressed` → `WebShellView.handleSystemBack()`
 * → `webView.evaluateJavascript("window.__dshSystemBack()")`；seam 未注入时壳层静默无操作。
 */

/** Cordis 插件名（与 bundle 行 id 一致）。 */
export const name = 'back-android'

/** 只依赖 webServer：`webserver/index-inject` 是它的注入口。 */
export const inject = ['webServer']

/** 审计标记：出现在下发脚本里，便于对账。 */
export const BACK_MARKER = 'DSH_ANDROID_SYSTEM_BACK'

/**
 * 页面 seam 脚本（内联字符串，随 index.html 注入）。不依赖 DOM 时机：仅定义
 * `window.__dshSystemBack`，状态判定发生在调用时刻（壳层拉起返回时）。
 */
export const SEAM_JS = `/* ${BACK_MARKER}: 系统返回 seam（设置/抽屉/弹窗关闭；首页/会话无操作） */
(function () {
  'use strict';
  if (typeof window.__dshSystemBack === 'function') return;
  function topModal() {
    var nodes = document.querySelectorAll('[role="dialog"][aria-modal="true"], [role="menu"]');
    return nodes.length > 0 ? nodes[nodes.length - 1] : null;
  }
  function drawerOpen() {
    var frame = document.querySelector('[data-sidebar-drawer]');
    if (!frame) return false;
    var center = frame.querySelector('[class*="_centerCol"]');
    var sidebar = frame.querySelector('[class*="_sidebarCol"]');
    return !!center && center.hasAttribute('inert') && !!sidebar && !sidebar.hasAttribute('inert');
  }
  function closeTopModal() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return true;
  }
  function closeDrawer() {
    var mask = document.querySelector('[data-sidebar-mask]');
    if (mask) mask.click();
    return true;
  }
  function systemBack() {
    if (topModal()) return closeTopModal();
    if (drawerOpen()) return closeDrawer();
    return false;
  }
  window.__dshSystemBack = systemBack;
})();
`

/**
 * 安装注入：把 seam 作为 `script` 行推入 index.html 注入表。
 * @param {import('@deepseek-ai/cordis').Context} ctx - 带 `webServer` 服务的插件上下文。
 * @returns {void}
 */
export function apply(ctx) {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'script', placement: 'head', text: SEAM_JS })
  })
}
