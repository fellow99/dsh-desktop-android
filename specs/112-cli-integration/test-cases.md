# 测试用例：CLI 集成（specs/112-cli-integration/test-cases.md）

> 分层：TC-112-CLI（新能力）· TC-112-L2（既有功能回归，依 `specs/overall-test-cases.md`）
> 取证纪律：宪法 C3（命令输出 / 截图 / `/_android/facts` / 会话记录为唯一判据）
> 敏感信息：**测试 API KEY 由会话外提供，仅在设备 UI 设置页内注入，绝不写进本文件或任何规格/日志文档（C10）**。
> 环境：真机 小米 M2105K81C（API 30 / arm64-v8a / Asia/Shanghai），备选 AVD `Pixel_10`。

## 一、前置状态

- `scripts/provision-cli.mjs` 已投放；`assembleFullDebug` 构建通过；`adb install -r` 成功。
- 设备时区 Asia/Shanghai（D.3）；POST_NOTIFICATIONS 已授权（如 33+）。
- 网络：npmjs 直连慢 → 默认 npmmirror（`DSH_ANDROID_REGISTRY`）。

## 二、TC-112-CLI（新能力）

### TC-112-1：产物随包核验
**Priority**: P1 ｜ **Type**: 构建门禁
**Precondition**: 已完成投放 + 构建
**Steps**:
1. `unzip -l <apk>` 核对 `lib/*/arm64-v8a/lib{node_cli,npm,npx,corepack,python_cli,pip,pip3,git_cli,git_http_fetch,git_remote_curl,uv_cli,pnpm_cli}.so`（12 件）
2. `unzip -l <apk>` 核对 `assets/cli/` 数据（node-bridge-tools / stdlib-assets / git-bridge-tools）
**Expected**: 12 件 `.so` 与 CLI 数据资产齐全
**Actual**: （测试时填）
**Status**: PASS / FAIL / SKIP

### TC-112-2：装载与物化
**Priority**: P1 ｜ **Type**: 功能
**Precondition**: 应用安装完成
**Steps**:
1. adb 启动应用，等待 READY
2. `adb shell run-as org.fellow99.dsh.android ls nativeLibraryDir`（.so 实体）
3. `adb shell run-as org.fellow99.dsh.android ls <filesDir>/payload/<sha12>/dsh/cli-data`（数据物化）
4. `curl /_android/facts` 查看 cli 探针字段
**Expected**: `.so` 实体在 nativeLibraryDir；cli-data 物化；facts 上报各工具版本或「缺失」（结构化，C2）
**Actual**:
**Status**:

### TC-112-3：Agent 上下文命令可用（bash 通路）
**Priority**: P1 ｜ **Type**: 功能
**Precondition**: 应用已 READY；新建会话
**Steps**（bash 工具逐条执行）:
1. `node -v && npm -v && npx -v`
2. `pnpm -v`
3. `python -V && python -c "import sys; print(sys.version)"` 与 `pip -V`
4. `uv --version`
5. `git --version && git config --global --list | head`
**Expected**: 各路均回真实版本号（26.13.0 / 12.16.1 / 3.14.10 / 0.13.6 / 2.56.0）
**Actual**:
**Status**:

### TC-112-4：PTY 终端面板命令回程
**Priority**: P1 ｜ **Type**: 功能
**Precondition**: 应用已 READY；终端面板可用（111）
**Steps**:
1. 终端面板执行 `node -e "console.log('pty-cli-ok')"`
2. 终端面板执行 `git --version`
**Expected**: 回 `pty-cli-ok` 与 git 版本；exit 正常
**Actual**:
**Status**:

### TC-112-5：替换 204-git —— 单一 `git` 工具闭环（第二阶段修订）
**Priority**: P1 ｜ **Type**: 功能
**Precondition**: 应用已 READY；公开 http(s) git 远端可达
**Steps**:
1. 工具表核验：会话工具表中 git 相关仅 **单一 `git`**（非 21 个 `git_*`）；host 日志 `@dsh-android/git: registered 1 tool (git passthrough)`
2. 会话内 `git init`（`dir`＝会话工作区）→ 返回 `code 0`/`root`；落盘断言 `.git`
3. 写 README → `git add -A` → `git commit -m …` → `git log --oneline`（含标题）→ `git status`（逐个经 `git` 工具，全程返回 code/stdout/stderr）
4. `git clone` 公开仓库（浅克隆 `--depth 1`）→ 返回 `code 0`/`root`
5. **argv 护栏**：`git` 工具执行 `--git-dir=/data/local/tmp …` → 拒绝（结构化错误）；`-C /sdcard …` → 拒绝；`-C <根内子目录>` → 放行
6. **凭据 mirror**：设置页存 `GIT_CREDENTIAL_<HOST>`（值＝测试凭据，**仅设备会话内注入，不落盘本文档**）→ `git` 工具对含该 host 的 URL 命令前置 mirror → 落盘断言 `$DSH_HOME/.git-credentials`（`0600`，git 格式一行）
7. 无凭据私有远端 → 结构化「缺失凭据」错误（提示 `GIT_CREDENTIAL_<HOST>`，非 401 裸错误）
**Expected**: 单一 `git` 工具 clone/commit/log/status 端到端闭环；护栏拒绝越界选项；mirror 落盘 0600；私有远端提示存储名
**Actual**:
**Status**:

### TC-112-6：替换 110-pnpm —— install/lookup 闭环
**Priority**: P1 ｜ **Type**: 功能
**Precondition**: 应用已 READY；registry（npmmirror）可达
**Steps**:
1. 市场/desktopPnpm：`pnpm view`（Lookup）一个包名
2. 工作区 `pnpm install`（纯 JS 依赖，ignoreScripts）→ node_modules 产出
**Expected**: lookup 与 install 经真实 pnpm 二进制完成；单飞锁与 exitCode 语义正确
**Actual**:
**Status**:

### TC-112-7：能力缺失诚实上报
**Priority**: P2 ｜ **Type**: 边界
**Precondition**: 移除任一 CLI `.so`（或重命名）后构建
**Steps**:
1. `git --version`（bash）→ 应结构化错误（非崩溃/非空回显）
**Expected**: 错误含 remedy；`/_android/facts` cli 字段 = missing
**Actual**:
**Status**:

## 三、TC-112-L2（既有功能回归，依 overall-test-cases.md）

> 具体步骤与取证模板复用 `docs/010-P0门禁报告.md` 阶段 2 与 `007` 用户验收用例。

### TC-112-L2-1：dsh Web UI 加载
**Priority**: P1 ｜ 判据：`?token=`→303→SPA 首屏（title=DSH Local Build）

### TC-112-L2-2：设置 DeepSeek API KEY（deepseek-flash）
**Priority**: P1 ｜ 判据：UI 设置页注入测试 API KEY（**值不落盘仓库**）；模型指示器 DeepSeek-Flash

### TC-112-L2-3：创建工作区
**Priority**: P1 ｜ 判据：browse 选择器采纳 `…/workspace`，会话目录建立

### TC-112-L2-4：一次对话「介绍一下你自己」
**Priority**: P1 ｜ 判据：新建会话 → 发送 → 流式中文回复 Completed

### TC-112-L2-5：看图分析
**Priority**: P1 ｜ 判据：上传/粘贴图片 → read_image 生效 → 内容回答正确

### TC-112-L2-6：敏感信息不落盘
**Priority**: P1 ｜ 判据：`grep -rnE "(sk-…|password=|Bearer )" specs docs logs` 无命中；日志无 token

## 四、报告

- 全部 Pass 后回填 `logs/<YYYYMMDD>-<N>/TEST_REPORT.md` + `evidence/` 截图/命令输出；对照 D.4 用户验收用例核对。
