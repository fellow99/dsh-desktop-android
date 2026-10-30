# 001-building-workflow · 功能规格（spec.md）

> 需求编号：`001-building-workflow` ｜ 需求名称：GitHub Actions 的构建流程 ｜ 分支：不改动（`main`）
> 依据：需求单（2026-10-29）；`docs/000-工程规划.md` §12（自分发）/§13（脚本与二进制不入库）；`specs/108-compliance-release`（FR-108-2 密钥不入库）
> 状态：✅ 已发布（debug 彩排 Run #6）→ **追加 release 正式签名（2026-10-30，Run #7）**
> 相关工程：`aosp-node-runtime`（引擎发布物）、`aosp-node-bridge`（Maven Central 依赖，构建期经 Gradle 解析，无 CI 特殊步骤）

## 1. 目标（Scope）

1. 建立 GitHub Actions 云端流水线：**push tag `v*`（首发 `v0.2.1`）触发**，全自动产出可侧载安装的 APK 并发布到 GitHub Release。
2. 云端完整复现本地构建三件套（规划 §13「二进制不入库」的必然推论）：
   - **引擎投放**（G12 链路）：下载 aosp-node-runtime v24.22.1 GitHub Release 归档 → `archiveSha256` 对账 → `tools/provision.mjs` 八项 ELF 门禁 → `provision-engine.mjs` 投放 `app/src/main/jniLibs`。
   - **载荷装配**（P1/P2/P3 管线）：deepseek-harness @ `dsh-v0.2.1-rc.2`（pnpm 构建）+ dsh-market @ `v1.66.42`（npm 构建）→ `assemble-payload --deploy --apply` → `package-payload`。
   - **APK 构建**：`:app:assembleFullDebug`（彩排版，debug 签名可直接侧载）。
3. 版本注入：从 tag 派生 `versionName` / `versionCode`，并同步到载荷 `dsh.version` 元信息。
4. **release 正式签名（2026-10-30 追加）**：tag 发布产出**固定密钥签名的 full/release APK**（可覆盖升级、可上架），替代原 debug 彩排包；签名材料零入库，经 GitHub Secrets 注入（实现 108 模块 FR-108-2 的 debug/release 签名分离）。

## 2. 功能需求

| # | 需求 | 验收 |
|---|---|---|
| FR-001-1 | 触发：`push` tag `v*`；另支持 `workflow_dispatch` 手动彩排（无 tag 时回落工程默认版本） | 首跑由 tag `v0.2.1` 触发成功 |
| FR-001-2 | 引擎投放（云端）：下载归档（`runtime.lock.json` 锁定 URL + `archiveSha256` 校验）→ 八项 ELF 门禁 → 投放 jniLibs | Actions 日志含门禁 8×✔ 与 `provision-engine` 投放完成 |
| FR-001-3 | 载荷装配（云端）：上游三仓 ref 显式锁定（见 §4）；pnpm@11.28.5（对齐 harness `packageManager`）；产物 `app/src/main/assets/dsh-payload/{dsh.tar,dsh.version}` | Actions 日志含 `assemble-payload` 断言全过 + `package-payload` sha256 |
| FR-001-4 | 版本注入：`v0.2.1` → `versionName=0.2.1`、`versionCode=MAJOR*10000+MINOR*100+PATCH`（=201，满足 FR-108-2 单调递增）；`package-payload` 的 `version=` 行 app 段同步注入（缺省回落现值，不改硬编码行为） | `aapt dump badging` 显示 versionName=0.2.1 / versionCode=201 |
| FR-001-5 | APK 构建：JDK 17 + Android SDK（显式补装 `build-tools;36.0.0`、`platforms;android-36`）+ `:app:assembleFullDebug` | 构建成功且产出 `app-full-debug.apk` |
| FR-001-6 | 发布：创建 GitHub Release（tag 同名）+ 附件 APK（**发布名 `dsh-desktop-<version>.apk`**，不带变体后缀；2026-10-30 定名）+ 摘要（`dsh.version` 内容、APK sha256、签名证书指纹）；同时上传 workflow artifact | Release 页可见 `dsh-desktop-0.2.1.apk` 可下载 |
| FR-001-7 | 可追溯性：上游 ref、引擎归档 sha256、载荷 sha256、APK sha256 全部在 run summary 输出 | summary 含四类指纹 |
| FR-001-8 | release 签名（追加）：tag 触发构建 `:app:assembleFullRelease` 并经固定 release 密钥签名；密钥经 secrets（KEYSTORE_BASE64/KEYSTORE_PASSWORD/KEY_ALIAS/KEY_PASSWORD）物化，四件套缺一即失败（**不回落 debug**）；`workflow_dispatch` 彩排仍出 debug 包 | Run #7 的 release APK 经 apksigner 验证证书 SHA-256 固定；tag 且缺 secret 时构建失败 |
| FR-001-9 | 签名材料零入库：`dsh-desktop-android.keystore`、`keystore.properties` gitignore（仅入库 `keystore.properties.sample`）；本地备份归责任人保管 | `git ls-files` 不含密钥/口令文件；sample 入库 |

## 3. 非目标（本期不做）

- ~~release 变体与正式签名~~ **已于 2026-10-30 追加实施（FR-001-8/9，实现 108/FR-108-2 签名分离部分）**；Play 上架签名（Play App Signing）仍属 108 P4。
- store flavor 构建与 Play 发布（本流水线只构建 full flavor；store flavor 签名配置同样可用但不构建）。
- 父工程（deepseek-harness-workspace）specs 不动——本模块文档只落 `dsh-desktop-android/specs/`。
- 不改上游三仓（harness/market/runtime 均为只读 checkout）。
- 不做 PR CI（main 推送不触发构建，仅 tag 触发 + 手动彩排）。

## 4. 上游锁定（单一事实源）

| 上游 | ref | 用途 |
|---|---|---|
 | `fellow99/aosp-node-runtime` | commit `605715e7`（origin/main HEAD；其 `runtime.lock.json` 的 active=24.22.1。注意：tag `v24.22.1` 的 lock 仍是 active=24.2.0 且无 24.22.1 条目，不可用于 CI） | `tools/provision.mjs` 八项门禁 + `runtime.lock.json`（release.tag/archive/archiveSha256/so sha256） |
| `deepseek-ai/deepseek-harness` | tag `dsh-v0.2.1-rc.2` | 载荷上游（pnpm build → deploy 物化） |
| `dsh-market/dsh-market` | tag `v1.66.42` | 市场包（npm build → dshmarket 物化） |

 ## 5. 约束

- 密钥/凭证不入库（FR-108-2/FR-001-9）；CI 仅用 `GITHUB_TOKEN` + 四个签名 secrets；keystore 本地备份（工程根 `dsh-desktop-android.keystore`，gitignore）由责任人保管，丢失即无法发布同签名升级。
- 二进制不入库（§13）：jniLibs、dsh-payload 仍由管线在构建期现做。
- 分支不改动：全部工作提交在 `main`。
 - 体积核对：载荷随包后实测 debug 全量包 ≈145 MB（dsh.tar 经 APK zip 压缩，15656 文件），仍在 FR-108-5 ≤200MB 预算内；release 签名体系属 108 模块 P4。

## 6. 门禁关联

复现并留证：G12（引擎投放链路云端化）。云端绿 = 本地三件套配方的机器无关性证据；真机侧载验证由用户在 Release 下载后执行（不在本流水线内）。
