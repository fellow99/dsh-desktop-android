# 001-building-workflow · 任务清单（tasks.md）

> 依赖顺序排列；全部在 `main` 分支直接提交（分支不改动约束）。

## T1 版本注入（前置，最小改动）

- [ ] T1-1 `app/build.gradle.kts`：`defaultConfig` 的 `versionName`/`versionCode` 读 Gradle 属性 `appVersionName`/`appVersionCode`（`project.findProperty`），缺省回落 `0.1.0`/`1`
- [ ] T1-2 `scripts/package-payload.mjs`：`version=` 行 app 段读 `process.env.DSH_APP_VERSION`，缺省回落 `0.1.0`
- [ ] T1-3 本地验证注入生效（见 test-cases TC-002/TC-003）

## T2 引擎投放段（workflow ①–⑤）

- [ ] T2-1 `.github/workflows/android-build.yml`：触发器（push tags `v*` + workflow_dispatch）、`permissions: contents: write`、`timeout-minutes: 120`
- [ ] T2-2 checkout 主仓 + aosp-node-runtime@v24.22.1
- [ ] T2-3 归档下载 + `archiveSha256` 对账 + 解包
- [ ] T2-4 `tools/provision.mjs` 八项门禁 + `provision-engine.mjs` 投放

## T3 载荷段（workflow ⑥–⑨）

- [ ] T3-1 Node 22 + pnpm@11.28.5 + store 缓存
- [ ] T3-2 checkout deepseek-harness@dsh-v0.2.1-rc.2（path `../deepseek-harness`）→ `pnpm install --frozen-lockfile` → `pnpm build`
- [ ] T3-3 checkout dsh-market@v1.66.42（path `../dsh-market`）→ `npm ci`/`npm i` → `npm run build`
- [ ] T3-4 `assemble-payload --deploy --apply` + `package-payload`（`DSH_APP_VERSION` 注入）

## T4 构建与发布段（workflow ⑩–⑮）

- [ ] T4-1 setup-java 17（gradle 缓存）+ sdkmanager 补装 build-tools;36.0.0 / platforms;android-36
- [ ] T4-2 `:app:assembleFullDebug`（tag 触发时附 `-PappVersionName/-PappVersionCode`）
- [ ] T4-3 `aapt dump badging` 断言 versionName/versionCode
- [ ] T4-4 产物收集改名 `dsh-<ver>-debug.apk` + sha256 + run summary 指纹
- [ ] T4-5 upload-artifact + `gh release create`（tag 触发才执行；先删后建保证重跑幂等）

## T5 验证与落地

- [ ] T5-1 workflow YAML 本地校验（TC-001）
- [ ] T5-2 本地彩排：按 ①–⑫ 配方在本机执行关键段（TC-005）
- [ ] T5-3 Code Review（requesting-code-review → receiving-code-review）并修复 Critical/Important
- [ ] T5-4 各阶段提交（git-commit 规范：`specification:` / `ci:` / `code-review-fix:` / `testing:` / `regression:`）
- [ ] T5-5 推送 main + 打 tag `v0.2.1` + 云端回归确认（TC-006）
