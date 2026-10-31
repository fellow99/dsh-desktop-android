# 品牌化 功能规格

> Module: 013-branding
> Status: Implemented（as-built；模拟器/源码证据；真机回归待做）
> Last Updated: 2026-11-01

## 1. 模块概述

### 1.1 目的（Why this module exists）

本模块定义 `dsh-desktop-android` 的应用级产品身份：应用名、启动图标、圆形图标、通知小图标，以及与 Web UI 品牌位的边界。Web UI 内部品牌位由 `205-plugin-branding` 实现。

### 1.2 解决的问题

- Android 启动器默认图标/名称为脚手架占位，需要与产品线统一为 “DSH Desktop”。
- Android 通知小图标必须是白色 alpha 剪影，彩色图标会被渲染成白方块。
- 应用级品牌（launcher/通知）与 Web UI 品牌位（侧栏/hero）职责不同，需要明确分工。

### 1.3 范围

**包含：**

- 应用名 `DSH Desktop`（`res/values/strings.xml` + Manifest `android:label`）。
- 启动图标 `ic_launcher` / 圆形图标 `ic_launcher_round`（五密度）。
- 通知小图标 `ic_stat_dsh`（白色剪影，五密度）。
- 物料生成：`scripts/generate-brand-assets.py` 从父工程 `assets/logo.png` 生成，幂等。

**不包含：**

- Web UI 内部品牌位（侧栏 logo/名称、hero、document title）——由 `205-plugin-branding` 实现。
- 应用包名 `org.fellow99.dsh.android`、版本号、签名与上架（属 `108-compliance-release`）。
- 商店 listing 文案、截图。

## 2. 用户故事

- 作为用户，我希望 Android 桌面/最近任务/设置里显示的应用名是 “DSH Desktop”，图标是产品 logo。
- 作为用户，我希望通知栏图标是清晰的白色剪影，而不是白方块。
- 作为维护者，我希望换 logo 只改父工程 `assets/logo.png` 并重跑生成脚本。

## 3. 功能需求

### 3.1 应用身份

- FR-013-001：`app/src/main/res/values/strings.xml` 的 `app_name` MUST 为 `DSH Desktop`。
- FR-013-002：`AndroidManifest.xml` 的 `android:label` MUST 引用 `@string/app_name`。
- FR-013-003：应用包名、`versionName`、`versionCode` MUST 由 `108-compliance-release` / `012-building-workflow` 管理，本模块不修改。

### 3.2 启动图标

- FR-013-004：Manifest 的 `android:icon` MUST 为 `@mipmap/ic_launcher`，`android:roundIcon` MUST 为 `@mipmap/ic_launcher_round`。
- FR-013-005：`mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png` MUST 存在，且为白底 + 居中产品 logo（legacy 图标不透明底）。
- FR-013-006：`mipmap-{...}/ic_launcher_round.png` MUST 存在，且为圆形裁切的产品 logo。
- FR-013-007：图标 MUST 由 `scripts/generate-brand-assets.py` 从父工程 `assets/logo.png` 生成；脚本 MUST 幂等，且源文件缺失时大声失败。

### 3.3 通知小图标

- FR-013-008：`drawable-{...}/ic_stat_dsh.png` MUST 存在，且为白色 + alpha 剪影（取 logo alpha 通道，纯白填充，内缩安全区）。
- FR-013-009：通知构建 MUST 使用 `ic_stat_dsh` 作为 small icon（不得使用彩色 launcher 图标）。

### 3.4 与 Web 品牌位的边界

- FR-013-010：Web UI 内部品牌位（页面标题、侧栏 logo/名称、hero）MUST 由 `205-plugin-branding` 实现；本模块 MUST NOT 修改上游源码或 Web 资源。
- FR-013-011：应用名 `DSH Desktop` MUST 与 `205-plugin-branding` 的 `PRODUCT_TITLE` 保持一致；不一致时 MUST 视为品牌缺陷。

## 4. 关键实体

| 实体 | 说明 | 关键属性 |
|------|------|----------|
| 应用名 | Android 应用标签 | `app_name`、`android:label` |
| 启动图标 | 五密度方形/圆形 | `ic_launcher`、`ic_launcher_round` |
| 通知图标 | 五密度白色剪影 | `ic_stat_dsh` |
| 生成脚本 | 品牌资产管线 | `generate-brand-assets.py` |
| 物料源 | 父工程 `assets/logo.png` | 200×200 RGBA |

## 5. 验收场景

### 场景：启动器名称与图标

- Given 安装 `fullDebug` APK
- When 查看启动器
- Then 应用名为 `DSH Desktop`，图标为产品 logo（方形/圆形均正确）

### 场景：通知图标

- Given agent 完成一轮任务或请求审批
- When 查看通知栏
- Then 小图标为白色剪影 `ic_stat_dsh`，不是白方块

### 场景：重新生成资产

- Given 父工程 `assets/logo.png` 更新
- When 运行 `python scripts/generate-brand-assets.py`
- Then 五密度图标与通知图标全部更新，重复运行结果稳定

## 6. 非功能需求

- **幂等**：生成脚本可重复运行，输出稳定。
- **兼容性**：覆盖 mdpi～xxxhdpi 五密度；legacy 图标不透明底，圆形图标透明圆外区域。
- **可维护性**：物料源唯一（父工程 `assets/`）。
- **证据**：真机启动器/通知截图为准。

## 7. 假设与约束

- 假设 `assets/logo.png` 为透明底、#1296db 品牌气泡，尺寸满足缩放。
- 约束：不修改包名与签名材料；不实现 Web 品牌位（属 205）。
- 约束：通知小图标必须符合 Android 白色剪影规范。

## 8. 依赖

- 物料：父工程 `assets/logo.png`。
- 工具：Python 3 + Pillow。
- 下游：`205-plugin-branding`（Web 品牌位）、`108-compliance-release`（包名/版本/签名）。
