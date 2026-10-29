# 001-building-workflow · 技术方案（plan.md）

> 对应 [spec.md](./spec.md)。落地物：`.github/workflows/android-build.yml` + 版本注入两处小改。

## 1. 交付物清单

| 文件 | 变更 | 说明 |
|---|---|---|
| `.github/workflows/android-build.yml` | 新增 | 单 job 流水线（详见 §2） |
| `app/build.gradle.kts` | 修改（~4 行） | `versionName`/`versionCode` 支持Gradle 属性覆盖，缺省回落现值（0.1.0/1） |
| `scripts/package-payload.mjs` | 修改（~3 行） | `version=` 行 app 段支持 `DSH_APP_VERSION` 环境变量覆盖，缺省回落 `0.1.0` |
| `specs/001-building-workflow/` | 新增 | 本四件套 |

## 2. 流水线结构（单 job：`build` / `ubuntu-latest` / `timeout 120min`）

```
① checkout 主仓（@ 触发 ref）
② checkout aosp-node-runtime @ v24.22.1 → tools/（含 provision.mjs + runtime.lock.json）
③ 引擎归档：curl 下载 node-v24.22.1-android-arm64-v8a.tar.gz
   → sha256sum 对账 lock.archiveSha256 → tar 解包 → 定位 libnode.so
④ node tools/provision.mjs --out <runtime>/node-runtime/src/main/jniLibs --from <libnode.so>
   （八项 ELF 门禁；libc++_shared.so 与 libnode.so 同目录时经 sibling 逻辑一并投放）
⑤ node scripts/provision-engine.mjs（DSH_ANDROID_RUNTIME_DIR=<②路径>）→ app/src/main/jniLibs/arm64-v8a
⑥ checkout deepseek-harness @ dsh-v0.2.1-rc.2 → path: ../deepseek-harness
   → Node 22 + pnpm@11.28.5（npm i -g，对齐 packageManager）→ pnpm install --frozen-lockfile → pnpm build
⑦ checkout dsh-market @ v1.66.42 → path: ../dsh-market → npm ci（缺 lockfile 则 npm i）→ npm run build
⑧ node scripts/assemble-payload.mjs --deploy --apply
⑨ DSH_APP_VERSION=<注入> node scripts/package-payload.mjs --src build/payload-stage/root
⑩ setup-java 17（缓存 gradle）+ sdkmanager 补装 build-tools;36.0.0 / platforms;android-36
⑪ ./gradlew :app:assembleFullDebug
    -PappVersionName=0.2.1 -PappVersionCode=201（tag 触发时由 ref 派生；dispatch 不注入）
⑫ aapt dump badging 验证 versionName/versionCode（FR-001-4 验收）
⑬ 收集产物：app/build/outputs/apk/full/debug/*.apk → 改名 dsh-<ver>-debug.apk + sha256
⑭ upload-artifact（APK + dsh.version）
⑮ gh release create（tag 触发时；附 APK + release notes 指纹摘要，FR-001-7）
```

### 关键环境

| 项 | 值 | 依据 |
|---|---|---|
| Runner | `ubuntu-latest` | 磁盘 ≥14GB、预装 Android SDK/NDK（findLibcxx 的 NDK 回退可用） |
| JDK | Temurin 17 | `compileOptions VERSION_17`（app/build.gradle.kts） |
| Node | 22 | 脚本仅用稳定 node: API；harness 需要 ≥20 |
| pnpm | 11.28.5 | harness `packageManager` 字段；不用 corepack（确定性安装） |
| Android SDK | 补装 `build-tools;36.0.0` + `platforms;android-36` | `buildToolsVersion = "36.0.0"` 显式锁定；GitHub 网络无代理问题，许可证已预接受 |

### 版本派生

```
tag 触发：VERSION=${GITHUB_REF_NAME#v}（v0.2.1 → 0.2.1）
versionCode = MAJOR*10000 + MINOR*100 + PATCH（0.2.1 → 201；同线单调递增，满足 FR-108-2）
workflow_dispatch：不注入 → 回落工程默认（0.1.0/1）——彩排语义
```

### 目录布局（runner workspace 并排）

```
home/runner/work/dsh-desktop-android/dsh-desktop-android/   ← 主仓
├── ../deepseek-harness/    ← DSH_ROOT（assemble-payload 硬编码 ../deepseek-harness）
├── ../dsh-market/          ← MARKET_ROOT（assemble-payload 硬编码 ../dsh-market）
└── node-runtime-checkout/  ← aosp-node-runtime（任意路径，经 DSH_ANDROID_RUNTIME_DIR 注入）
```

### 缓存策略

- `setup-java` 内建 `cache: gradle`（~/.gradle）。
- pnpm store：`pnpm config set store-dir ~/.pnpm-store` + `actions/cache`（key 含 harness ref）。
- 引擎归档（85MB）不缓存：单次下载成本低，避免缓存污染。

## 3. 风险与对策

| 风险 | 对策 |
|---|---|
| Linux 上 `pnpm deploy --legacy` 产生 symlink（Windows 是 Junction） | `assemble-payload.materializeLinks` 对 symlink 同样 dereference 复制；`assertNoLinks` 兜底断言 |
| harness pnpm build 在 Linux 首次执行 | 依赖均为纯 JS（native 侧 sharp 已被 S2 垫片、win32/linux 二进制被剪裁规则剔除） |
| runner 磁盘（harness node_modules + 载荷 + Gradle 缓存） | 单 job 顺序执行，峰值 <8GB，ubuntu-latest 默认 ~14GB 可容纳；`--frozen-lockfile` 减少重复解析 |
| 归档内 libc++_shared.so 布局未知 | provision.mjs sibling 优先 → NDK sysroot 回退（runner 预装 NDK）；两路任一可用 |
| Release 重跑（tag 已存在） | `gh release create ... --clobber` 语义不可用（create 无 clobber）；改为「先删后建」（`gh release delete -y` + 重建），保证幂等 |
| `versionCode` 未来 tag 倒退（如 v0.2.0 在 v0.2.1 后打） | 派生公式天然单调（同 major.minor 线）；跨线倒退属发布纪律问题，登记不在代码层强拦 |

## 4. 宪法合规（specs/constitution.md 摘要）

- C3 证据纪律：run summary + Actions 日志作为验收证据留档。
- C10 敏感信息：workflow 无密钥；仅 `GITHUB_TOKEN`（`permissions: contents: write`）。
- §13 二进制不入库：CI 现做现用，不落库。
