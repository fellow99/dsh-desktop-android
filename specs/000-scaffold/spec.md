# 000-scaffold · 功能规格（spec.md）

> 需求编号：`000-scaffold` ｜ 需求名称：工程搭建 ｜ 分支：不改动（`main`）
> 依据：`docs/000-工程规划.md`；同构参考：`dsh-desktop-ark/specs`
> 状态：🟡 Partial（骨架完成；真机门禁与正式载荷属后续阶段）

## 1. 目标（Scope）

1. 建立 `dsh-desktop-android` 的 Gradle/Kotlin 基础脚手架：**不实现具体业务功能**。
2. 对规划中**未明确/未验证的判断**实现探针（P0 门禁载体），在真机上取得证据；探针验收后**清理**。
3. 建立本工程 `specs/` 规范文档体系（本目录 + 根文档 + 模块骨架）。
4. 为后续 P1（正式载荷与 dsh Host）打通：引擎投放、载荷打包/解包契约、启动编排骨架。

## 2. 功能需求

| # | 需求 | 验收 |
|---|---|---|
| FR-000-1 | Gradle 工程：单 `:app`，AGP/Kotlin 版本目录，wrapper，`full`/`store` flavor，minSdk 29/targetSdk 36/compileSdk 36，仅 arm64 | `gradle assembleFullDebug` 成功 |
| FR-000-2 | 引擎投放脚本（sha256 对账 `runtime.lock.json`）→ `app/src/main/jniLibs` | `provision-engine.mjs` 全 ✓ |
| FR-000-3 | 载荷打包脚本（确定性裸 ustar + `dsh.version`）→ assets | `package-payload.mjs` + `tar -tvf` 合法 |
| FR-000-4 | Kotlin 外壳骨架：`DshApplication`/`MainActivity`/`WebShellView`/`DshRuntime`/`PayloadInstaller`/`Probe`/`HostCapabilities`/`AppLog`/`Constants` | 代码落地，构建通过 |
| FR-000-5 | 启动编排状态机（installing→starting→waiting→probing→ready/running/failed）与就绪判据 | 代码符合 §6.2；真机验证在 L1 |
| FR-000-6 | WebView §6.3 配置矩阵 + 导航围栏 + 渲染自愈 + 版本门禁 | 代码落地 |
| FR-000-7 | 宿主能力首批（echo/log.write/runtime.facts/perm.allFiles.status/shutdown + 探针 probe.allFiles） | 代码落地 |
| FR-000-8 | 探针载荷 `payload/bootstrap.js`：env 断言、versions/Intl/sqlite-FTS5/zstd/sh/payload 探测、宿主桥 invoke、HTTP 探针页、ready 信封 | 真机 `/probe.json` 证据 |
| FR-000-9 | 探针清理：门禁报告定稿后删除探针载荷与 [PROBE] 代码位 | 仓库无 probe 残留 |
| FR-000-10 | 规范文档：specs 根 10 文件 + 000-scaffold 四件套 + 15 模块骨架 | 本目录 |

## 3. 非目标（本期不做）

- 不装配正式 dsh 载荷（上游依赖树、web dist、`@dsh-android/*`、pnpm、market）——P1。
- 不实现 16 项宿主能力全集、目录选择、通知、图片桥、前台服务——P2。
- 不做 git 插件/市场/搜索——P3。
- 不签名发布——P4。

## 4. 门禁关联

本需求交付的探针直接服务于规划 §10.1：**G1、G2、G3(min)、G4、G5、G8、G9、G12、G-WV**。
G3（完整 dsh Host）、G6（pnpm）、G7（图像桥）、G10、G11、G13 属后续阶段。
