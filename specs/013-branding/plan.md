# 013-branding 技术方案（As-Built）

> 本文档记录 `dsh-desktop-android` 应用级品牌化的实际实现。
> Module: 013-branding
> 对应规格: [spec.md](./spec.md)
> Last Updated: 2026-11-01

## 1. 技术上下文

### 1.1 运行环境

- Android minSdk 26 / targetSdk 36 / only arm64-v8a。
- Kotlin（View 体系）+ 系统 WebView。
- 构建：Gradle 8.12 + AGP 8.10.1 + JDK 17。
- 品牌资产生成：Python 3 + Pillow（构建机工具，不随 APK）。

### 1.2 依赖与物料

| 项 | 来源 | 用途 |
|----|------|------|
| `assets/logo.png` | 父工程 `assets/` | 启动图标/圆形图标/通知图标源 |
| `scripts/generate-brand-assets.py` | 本工程 | 五密度资产生成 |
| `res/values/strings.xml` | 本工程 | `app_name` |
| `AndroidManifest.xml` | 本工程 | `android:icon` / `roundIcon` / `label` |

## 2. 宪法合规

| 原则 | 状态 | 说明 |
|------|------|------|
| C1 上游零补丁 | ✅ | 仅应用资源与生成脚本 |
| C2 平台真相不隐藏 | ✅ | 应用级品牌与 Web 品牌位分工显式登记 |
| C3 证据 | ✅ | 真机截图/资产尺寸为判据 |
| C12 二进制不入库 | ✅ | 生成脚本入库；PNG 为小体积资源，可入库 |
| C14 文档描述是什么 | ✅ | 路径/尺寸来自实际脚本与资源 |

## 3. 研究结论

- Android 8+ 之前的 legacy 启动图标需要不透明底；脚本用白底 + 86% 居中 logo。
- 圆形图标通过椭圆 mask 裁切，圆外透明。
- 通知小图标必须是白色 + alpha 剪影；脚本取 logo alpha 通道，纯白填充，内缩 92% 安全区。
- 应用名与 Web 品牌名一致为 `DSH Desktop`；Web 品牌位由 `@dsh-android/branding`（205）负责。

## 4. 数据模型

无数据实体；仅静态资源与字符串。

| 类型 | 说明 |
|------|------|
| 生成资产 | `mipmap-*/ic_launcher.png`、`mipmap-*/ic_launcher_round.png`、`drawable-*/ic_stat_dsh.png` |
| 字符串 | `app_name` |
| Manifest 引用 | `@mipmap/ic_launcher`、`@mipmap/ic_launcher_round`、`@string/app_name` |

## 5. 接口契约

| 文件 | 内容 |
|------|------|
| `app/src/main/res/values/strings.xml` | `<string name="app_name">DSH Desktop</string>` |
| `app/src/main/AndroidManifest.xml` | `android:icon="@mipmap/ic_launcher"`、`android:roundIcon="@mipmap/ic_launcher_round"`、`android:label="@string/app_name"` |
| `scripts/generate-brand-assets.py` | 输入 `../assets/logo.png`；输出五密度 mipmap + drawable |
| `app/src/main/res/mipmap-*/ic_launcher.png` | 48/72/96/144/192 px，白底 + 居中 logo |
| `app/src/main/res/mipmap-*/ic_launcher_round.png` | 同上，圆形裁切 |
| `app/src/main/res/drawable-*/ic_stat_dsh.png` | 24/36/48/72/96 px，白色剪影 |

## 6. 实现策略

### 6.1 架构模式

“源物料 + 生成脚本 + 资源引用”：父工程 logo 为唯一源，脚本生成 Android 多密度资产，Manifest/strings 固定引用。

### 6.2 关键实现

- `launcher_icon(size, logo)`：白底画布，logo 缩放到 86%，居中合成。
- `launcher_icon(..., round_mask=True)`：椭圆 mask 裁切，圆外透明。
- `notification_icon(size, logo)`：取 logo alpha，纯白填充，内缩 92%。
- `main()`：遍历密度表，幂等写入。

### 6.3 错误处理

- 源文件缺失：`sys.exit` 大声失败。
- 输出目录不存在：`os.makedirs(..., exist_ok=True)`。

### 6.4 性能

构建期一次性生成，运行时零开销。

## 7. 测试考虑

- 真机启动器/最近任务/设置中的名称与图标。
- 通知栏小图标（完成/审批）白色剪影。
- 脚本重复运行输出稳定（可比较 hash）。
- 圆形图标在不同启动器下的裁切表现。

## 8. 文件清单

| 文件 | 用途 |
|------|------|
| `scripts/generate-brand-assets.py` | 品牌资产生成 |
| `app/src/main/res/values/strings.xml` | `app_name` |
| `app/src/main/AndroidManifest.xml` | 图标/名称引用 |
| `app/src/main/res/mipmap-*/ic_launcher.png` | 启动图标 |
| `app/src/main/res/mipmap-*/ic_launcher_round.png` | 圆形图标 |
| `app/src/main/res/drawable-*/ic_stat_dsh.png` | 通知小图标 |
| `packages/branding-android/` | Web 品牌位（205，不在本模块实现） |
