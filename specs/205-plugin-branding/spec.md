# 205 · 品牌资产（spec.md）

> 状态：✅ Implemented（2026-10-30）｜ 依据：docs/000-工程规划.md ｜ 源码落点：res/mipmap-*（官方 logo 生成）、`packages/branding-android/`
> 目标：图标/名称/首启门禁（§13.1）。
>
> 实现记录：
> - 启动图标：`scripts/generate-brand-assets.py` 从工作区 `../assets/logo.png`（与 hos/ark 同源的 #1296db 气泡）生成五密度 `ic_launcher.png` / `ic_launcher_round.png` 与通知小图标 `ic_stat_dsh.png`（白色剪影）；manifest 指向 `@mipmap/ic_launcher`。
> - 应用名：`DSH Desktop`（res/values/strings.xml）。
> - Web 品牌位：`@dsh-android/branding`（移植 @dsh-ohos/branding）——页面标题 `webServer.tapIndex`、hero 标语 CSS 隐藏规则、sidebar.brand.mark/name + conversation.hero.brand.mark 三槽位、document.title 守卫；bundle insert 挂载，上游零补丁。

## 功能需求

- FR-205-1 正式应用图标与名称
- FR-205-2 首启引导/门禁（如需）

## 验收与测试

- 用例索引：—
- 证据纪律：宪法 C3（截图/命令输出/JSON 为唯一判据）。
