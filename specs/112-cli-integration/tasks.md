# 112 · CLI 集成 tasks.md

> 规格：`./spec.md` ｜ 方案：`./plan.md` ｜ 测试：`./test-cases.md`
> 格式：`- [ ] [TaskID] [P?] [US?] 描述（file path）`；P=可并行；US1..US4 对应用户故事。
> 用户故事：US1 五件套随包与部署（FR-112-1/2）· US2 环境引导层 + Agent 上下文命令可用（FR-112-3）· US3 替换 204-git（FR-112-4；第二阶段修订：精简为单一 git passthrough）· US4 替换 110-pnpm（FR-112-5）。

## Phase 1 · Setup

- [x] T001 建立 `specs/112-cli-integration/` 四件套（spec/plan/tasks/test-cases），登记 `specs/README.md` 112 条目与 `SPECS_CHECKLIST.md`
- [x] T002 核对 `.gitignore` 追加 CLI 二进制与 CLI 数据资产排除项（二进制/大资产不入库，宪法纪律）
- [x] T003 建立 `scripts/cli.lock.json`（五件版本 + sha256 + size + 产物清单，事实源）

## Phase 2 · Foundational（阻塞 US1–US4 的公共设施）

- [x] T004 新增 `scripts/provision-cli.mjs`：下载/本地归档 → sha256 校验 → 归一化解包（.so→jniLibs，数据→assets/cli）→ 记录 `cli.gates.json`；`--check` 复位
- [x] T005 执行 `provision-cli.mjs` 投放五件套到 `app/src/main/jniLibs/arm64-v8a/` 与 `app/src/main/assets/cli/`（真机/构建前必需）
- [x] T006 [P] `assemble-payload.mjs` 新增 CLI 数据资产入载荷 stage（`assets/cli` → `root/dsh/cli-data/`），含 licenses；`dsh.version` 对账链随之更新
- [x] T007 [P] 新增/接入载荷阶段 CLI 物化 env：`DSH_CLI_DATA_DIR`（Kotlin `DshRuntime.kt` opts.env 与 `Constants.kt`）

## Phase 3 · US1 五件套随包与部署

- [x] T008 [US1] Gradle 校验：`assembleFullDebug` 含 12 个 CLI `.so`（unzip 核）与 assets/cli 数据；APK 体积记录
- [x] T009 [US1] 首启 CLImarker：`<payload>/dsh/cli-data` 随载荷物化、`nativeLibraryDir` 12 件实体（真机 `ls` 取证）
- [x] T010 [US1] CLI 版本探针写 `/_android/facts`（node/npm/pnpm/python/uv/git 版本或「缺失」结构化字段，C2）

## Phase 4 · US2 环境引导层 + Agent 上下文命令可用

- [x] T011 [US2] 新增 `payload/cli-env.js`（bootstrap 登记）：导出 D4 全套 env（PATH/LD_LIBRARY_PATH/SSL_CERT_FILE/GIT_*/PYTHON*/npm_config_registry）
- [x] T012 [US2] `$HOME/bin` 符号链接农场（node/npm/npx/corepack/python/python3/pip/pip3/uv/pnpm/git + git remote helper 名）；幂等 marker
- [x] T013 [US2] `@dsh-android/subprocess` 护栏放行 `nativeLibraryDir`（`NATIVE_LIB_DIR_ROOT`）+ 默认 PATH 用引导层注入值
- [x] T014 [US2] 真机取证：bash 工具 `node -v`、`npm -v`、`pnpm -v`、`python -V`、`pip -V`、`uv --version`、`git --version` 全回真实版本
- [x] T015 [US2] PTY 终端面板 `node -e "console.log(1)"` + `git --version` 回程取证（111 PTY 通路复用）

## Phase 5 · US3 替换 204-plugin-git（isomorphic-git → aosp-git-cli）

- [x] T016 [US3] 新增 `packages/git-android/lib/git-exec.js`：栅栏化 spawn 真实 `git` 的执行器（argv/环境/超时/abort/输出采集/脱敏）
- [x] T017 [US3] `lib/runtime.js`：`loadGit()` → `loadGitBinary()`（解析 NLDIR/PATH git，缺失结构化错误含 remedy）
- [x] T018 [US3] 凭据迁移：`lib/auth.js` HTTP 认证 → 写 `$HOME/.git-credentials`（0600 临时+rename）置信 / `GIT_ASKPASS`；`GIT_CREDENTIAL_<HOST>` 存储契约不变
- [x] T019 [P] [US3] 21 工具批量迁移（init/clone/status/diff/log/show/add/commit/branch/checkout/reset/merge/cherry-pick/revert/stash/tag/remote/fetch/pull/push/config），保持 Schema/输出/超时/围栏语义
- [x] T020 [US3] 移除 isomorphic-git 物化（assemble-payload `collectGitRuntime`）与 `loadGit()` 纯 JS 通路；删除 `packages/git-android/node_modules/isomorphic-git`
- [x] T021 [US3] 真机 `git_clone`（公开仓库）+ `git_commit` + `git_push`（本地 git-daemon 或既有 smart-HTTP 通道）端到端闭环

## Phase 6 · US4 替换 110-pnpm-integration（pnpm v10 → aosp-pnpm-cli）

- [x] T022 [US4] `host-boot.js#configureMarketRuntime`：`DSH_PNPM_ENGINE` → `$HOME/bin/pnpm`；`pnpm-workspace.yaml` 生成保留
- [x] T023 [US4] `packages/market-android` desktopPnpm worker：纯 JS worker → spawn pnpm 二进制；契约成员（install/lookup/…）逐字保留
- [x] T024 [US4] 移除纯 JS pnpm v10 引擎随包（`dsh-market-pnpm` 不再物化）
- [x] T025 [US4] 真机 `pnpm install`（纯 JS 依赖）+ `pnpm view/lookup` 闭环取证

## Phase 7 · Polish & 跨切面

- [x] T026 规格回填：`specs/README.md`（112 ✅/状态）、`204-plugin-git/spec.md`、`110-pnpm-integration/spec.md` → 集成声明指向本需求；能力清单 D.2/D.5 追加 112 记录
- [x] T027 敏感信息扫描：`grep -rnE "(sk-[A-Za-z0-9]{20,}|password\s*=|Bearer )" specs docs logs` 无命中；日志无 token
- [x] T028 `codegraph sync` 增量更新索引；父工程提交子模块指针（子工程内先提交）

## Phase 8 · 修订（第二阶段）：git 工具族精简为单一 `git` passthrough（FR-112-4a/b/c/d/e 修订）

> 依据：第二阶段决策「LLM 已精通 git 命令，21 个按动词工具可精简」；信封（围栏/凭据/执行器/设置页）保留。
> 第一阶段（US3 完成、已提交）后追加本阶段；Checkbox 反映当前执行进度。

- [ ] T029 [US3] 新增 `packages/git-android/lib/tools/git.js`：单一 `git` passthrough（argv/dir/timeoutMs + 升级字段；返回 code/root/stdout/stderr；非零退出如实返回；两类失败映射）
- [ ] T030 [US3] argv 护栏：拒绝 `--git-dir`/`--work-tree`/`--exec-path`/`--separate-git-dir`/`--config-env=`，`-C` 绝对路径须在根内
- [ ] T031 [US3] 凭据前置 mirror：spawn 前对 argv 内 http(s) URL 调 `credentials.lookup`（store→.git-credentials；0600/temp+rename）
- [ ] T032 [US3] 重写 `lib/index.js`（注册 1 工具）；`lib/fence.js` 去 fs-adapter/createRepositoryFs/isMissingRepository；`lib/auth.js` 去 callbacks()
- [ ] T033 [US3] 删除 21 工具 + `toolkit/report/diff/fs-adapter/merge-worktree/runtime`；`assemble-payload.mjs` 去 assertGitClosure/collectMarketPNPM/collectReflinkStub 死代码
- [ ] T034 [US3] README/package.json/bundle-android 注释去纯 JS 措辞；`node --check` 全量通过、无孤儿 import
- [ ] T035 [US3] 构建 `assembleFullDebug` + 真机安装；工具表仅 `git`（非 21）
- [ ] T036 [US3] 真机 `git` e2e：init→add→commit→log→status（Agent 经 git 工具）+ clone（公开 http(s)）+ argv 护栏拒绝验证 + 凭据 mirror 落盘核验
- [ ] T037 回填 TEST_REPORT/REVIEW_REPORT；specs/README.md（T-023 21 工具→git passthrough）；sensitive 扫描；codegraph sync；子模块+父工程提交
