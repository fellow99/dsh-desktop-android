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
- [ ] T5-5 推送 main + 打 tag `v0.2.1` + 云端回归确认（TC-006）
