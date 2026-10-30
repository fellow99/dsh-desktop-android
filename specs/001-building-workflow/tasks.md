# 001-building-workflow · 任务清单（tasks.md）

> 依赖顺序排列；全部在 `main` 分支直接提交（分支不改动约束）。

## T1 版本注入（前置，最小改动）

- [x] T1-1 `app/build.gradle.kts`：`defaultConfig` 的 `versionName`/`versionCode` 读 Gradle 属性 `appVersionName`/`appVersionCode`（`project.findProperty`），缺省回落 `0.1.0`/`1`
- [x] T1-2 `scripts/package-payload.mjs`：`version=` 行 app 段读 `process.env.DSH_APP_VERSION`，缺省回落 `0.1.0`
- [x] T1-3 本地验证注入生效（见 test-cases TC-002/TC-003）

## T2 引擎投放段（workflow ①–⑤）

- [x] T2-1 `.github/workflows/android-build.yml`：触发器（push tags `v*` + workflow_dispatch）、`permissions: contents: write`、`timeout-minutes: 120`
- [x] T2-2 checkout 主仓 + aosp-node-runtime（评审修复：锁 `origin/main@605715e7`，tag v24.22.1 的 lock 不可用）
- [x] T2-3 归档下载（评审修复：`release.tag + release.archive` 构造直链）+ `archiveSha256` 对账 + 解包
- [x] T2-4 `tools/provision.mjs` 八项门禁（显式 `--node 24.22.1` + active 断言）+ `provision-engine.mjs` 投放

## T3 载荷段（workflow ⑥–⑨）

- [x] T3-1 Node 22 + pnpm@11.28.5 + store 缓存（评审修复：key=pnpm-lock.yaml sha256）
- [x] T3-2 checkout deepseek-harness@dsh-v0.2.1-rc.2（评审修复：path `upstream/deepseek-harness` + `DSH_HARNESS_DIR` 注入）→ `pnpm install --frozen-lockfile` → `pnpm build`
- [x] T3-3 checkout dsh-market@v1.66.42（path `upstream/dsh-market`）→ `npm ci` → `npm run build`
- [x] T3-4 `assemble-payload --deploy --apply` + `package-payload`（`DSH_APP_VERSION` 注入）

## T4 构建与发布段（workflow ⑩–⑮）

- [x] T4-1 setup-java 17（gradle 缓存）+ sdkmanager 补装 build-tools;36.0.0 / platforms;android-36
- [x] T4-2 `:app:assembleFullDebug`（tag 触发时附 `-PappVersionName/-PappVersionCode`；gradlew 补 100755 执行位）
- [x] T4-3 `aapt dump badging` 断言 versionName/versionCode（评审修复：versionCode 在前）
- [x] T4-4 产物收集改名 `dsh-<ver>-debug.apk` + sha256 + run summary 指纹
- [x] T4-5 upload-artifact + `gh release create`（tag 触发才执行；评审修复：先删后建、不再误用 `--cleanup-tag` 旗标）

## T5 验证与落地

- [x] T5-1 workflow YAML 本地校验（TC-001）
- [x] T5-2 本地彩排：关键段本机执行（TC-004/005；引擎 URL/门禁口径实证见 REVIEW_REPORT）
- [x] T5-3 Code Review（requesting-code-review → receiving-code-review）：5C/4I/5M 全部闭环（REVIEW_REPORT.md）
- [x] T5-4 各阶段提交（git-commit 规范前缀：`docs` / `build` / `ci` / `fix` / `test`）
 - [x] T5-5 推送 main + 打 tag `v0.2.1` + 云端回归确认（TC-006）→ Run #6 全绿，Release v0.2.1 已发布 debug APK（附件事后丢失，见 20261030-1）

## T6 release 正式签名（2026-10-30 追加，参考 oc-desktop-android）

- [x] T6-1 生成 `dsh-desktop-android.keystore`（RSA 2048 / PKCS12 / alias=dsh-desktop-android / 有效期 10000 天）+ 本地 `keystore.properties`（gitignore）+ `keystore.properties.sample`（入库）
- [x] T6-2 `app/build.gradle.kts`：读根目录 `keystore.properties`，有材料时注册 `signingConfigs.release` 并挂到 `buildTypes.release`；无材料时 release 不签名（本地无材料构建不炸）
- [x] T6-3 workflow：⑩a 签名注秘步骤——tag 触发四 secrets（KEYSTORE_BASE64/KEYSTORE_PASSWORD/KEY_ALIAS/KEY_PASSWORD）缺一即失败并 `keytool -list` 预校验；`workflow_dispatch` 回落 debug；⑪ 改打 `assembleFullRelease`（BUILD_VARIANT 驱动）；⑫–⑮ 产物路径/命名（`dsh-<ver>-release.apk`）/Release notes 随变体
- [x] T6-4 GitHub Secrets 四项配置（gh secret set，已核验 list）
- [x] T6-5 本地验证：`signingReport`（fullRelease→release config）+ `assembleFullRelease -PappVersionName=0.2.1 -PappVersionCode=201` + apksigner 证书 SHA-256 对账（TC-008）
- [x] T6-6 重打 tag `v0.2.1`（→ 4703d6c）触发 Run #7 → 全绿，`dsh-0.2.1-release.apk`（185,508,348 B）上 Release，⑫b apksigner 云端证书对账一致（TC-009 PASS）

## T7 发布产物改名（2026-10-30）

- [x] T7-1 workflow ⑬ 产物名统一为 `dsh-desktop-<version>.apk`（去掉变体后缀；中间产物路径仍按变体 `app-full-<variant>.apk`）
- [x] T7-2 重打 tag `v0.2.1`（→ 98f0644）→ Run #8（41144737353）全绿，Release 附件 `dsh-desktop-0.2.1.apk`（185,508,340 B），签名/版本回归一致（logs/20261030-2/TEST_REPORT.md）
