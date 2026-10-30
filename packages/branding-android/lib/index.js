/**
 * `@dsh-android/branding` —— DSH Desktop 品牌位的 **Host 半边**（移植自 @dsh-ohos/branding）。
 *
 * 只做两件上游留了官方口子的事（上游源码零改动）：
 *   1) 页面标题：上游 `apps/web/index.html` 写死 `<title>DSH Local Build</title>`，
 *      用 `webServer.tapIndex()`（结构化注入行表达不了的原始 HTML 变换口）改成产品名；
 *      Android WebView 的窗口标题取 `document.title`，所以这是「标题」对外的实际落点。
 *   2) hero 标语：上游会话空态把 `t('hero.headline')`（"探索未至之境" / "Into the Unknown"）
 *      与 Preview 徽标写死在组件里，既没有槽位也不能用 locale 覆盖（`locale.register`
 *      对同一 (命名空间, 语言) 只允许一个占用者，会抛错）。因此用 `webserver/index-inject`
 *      的 `style` 行下发一条以我们品牌位标记为锚点的规则：只有本产品的品牌位真的画出来
 *      （浏览器半边装上了），上游标语才被隐藏；品牌位没装上时规则不匹配，界面退回上游原样。
 *
 * 边界：不改上游源码、不伪造上游开关、不动 DeepSeek 账号/推理等业务身份；
 * 上游的版权与 MIT 归属说明照旧保留。
 *
 * 与 ohos 版的唯一差异：插件名/标记前缀（android），几何与文案完全一致（同源 assets/logo.svg）。
 */

/** Cordis 插件名（与 bundle 行 id 一致）。 */
export const name = 'branding-android'

/** 只依赖 webServer：两处都是它的服务口。 */
export const inject = ['webServer']

/** 产品名（与 `app/src/main/res/values/strings.xml` 的 `app_name` 同源）。 */
export const PRODUCT_TITLE = 'DSH Desktop'

/** 审计标记：出现在下发的样式里，便于对账。 */
export const BRAND_MARKER = 'DSH_ANDROID_BRANDING'

/** hero 品牌位标记属性：只有浏览器半边的 hero 占用者带它，CSS 以它为锚点。 */
export const HERO_ATTR = 'data-dsh-android-hero'

/**
 * hero 品牌位的替换规则（结构说明同 ohos 版）：
 * `:has()` 先定位 `.headline`，再隐藏不含品牌位的直接 span（上游 titleGroup）；
 * 品牌位锚点（hero 独占属性）保证规则只命中 hero 那一行，永不选中品牌位自己。
 * 上游若改 hero 结构，规则不匹配（标语恢复原样），不会误伤别的元素。
 */
export const HERO_CSS = `/* ${BRAND_MARKER}: 上游 hero 标语/Preview 徽标由本产品品牌位接管 */
div:has(> span > [data-slot="conversation.hero.brand.mark"] [${HERO_ATTR}]) > span:not(:has([${HERO_ATTR}])){display:none !important}
`

/** 首个 `<title>…</title>`（容忍上游改写模板的缩进与内容）。 */
const TITLE_PATTERN = /<title>[\s\S]*?<\/title>/i

/**
 * 把页面标题换成产品名。已是目标标题时原样返回（幂等）。
 * @param {string} html - 上游返回的 index.html 文本。
 * @returns {string} 替换后的文本；模板里没有 `<title>` 时原样返回。
 */
export function replacePageTitle(html) {
  const replacement = `<title>${PRODUCT_TITLE}</title>`
  if (html.includes(replacement)) return html
  return TITLE_PATTERN.test(html) ? html.replace(TITLE_PATTERN, replacement) : html
}

/**
 * 安装两处品牌位注入。
 * @param {import('@deepseek-ai/cordis').Context} ctx - 带 `webServer` 服务的插件上下文。
 * @returns {void}
 */
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.tapIndex(replacePageTitle), 'branding-android: page title')
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'style', text: HERO_CSS })
  })
}
