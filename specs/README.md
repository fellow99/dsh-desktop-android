# 规格文档索引（specs/README.md）

**项目名称：** DSH Desktop（Android 版） · `dsh-desktop-android`
**版本：** 0.1.0（`versionCode` 1）
**上游基线：** `deepseek-harness` `dsh-v0.2.1-rc.5` ｜ 引擎 Node **v26.13.0**（`node-runtime` AAR，Maven Central）｜ 桥 `node-bridge` **0.2.0**（Maven Central：`io.github.fellow99:node-bridge`）｜ 配套 `node-pty` **26.13.0**（111-pty-integration）

**技术栈：** Kotlin（View 体系）· 系统 WebView · 进程内 `libnode.so`（`node::Start`，JNI 槽位表桥）· dsh Host（HTTP + WebSocket）
**文档生成时间：** 2026-10-27 ｜ **最后更新：** 2026-11-01（按父工程编号规则整理：0XX 公共 / 1XX 基础 / 2XX 插件）｜ **对应需求：** `000-scaffold`

---

## 一、文档总览

| 层级 | 分类 | 文档数量 | 说明 |
|---|---|---|---|
| 整体 | 项目级顶层文档 | 10 | 索引、清单、结构、技术、架构、宪法、overall-* |
| 需求 | `000-scaffold`（工程搭建，保留 000 例外编号） | 4 | spec / plan / tasks / test-cases |
| 模块 | 公共需求模块（0XX） | 4 | 012-building-workflow、013-branding 各 spec + plan |
| 模块 | 运行时与外壳（101–105、109、110） | 目录骨架 | 每模块 `spec.md` + `plan.md` |
| 模块 | 适配与发布（106–108） | 目录骨架 | 每模块 `spec.md` + `plan.md` |
| 模块 | 生态（201、204、205、206） | 目录骨架 | 每模块 `spec.md` + `plan.md` |
| **合计** | **10 根文件 / 17 模块目录 / 39 模块文件 / 49 文件** | | |

> 按需求约定，不生成 `API.md` 与 `overall-api.md`。
> 本工程与 `dsh-desktop-ark` **架构同构、编号对齐**（便于互译）；平台事实（桥形态、载荷解包、权限模型）全部换成 Android 侧，见 `docs/000-工程规划.md`。
> 编号规则见父工程 [`../../specs/constitution.md`](../../specs/constitution.md)：`0XX` = 各子工程公共需求，`1XX` = 本工程基础功能，`2XX` = 补丁/插件。本工程是 1XX 编号的基准工程。

---

## 二、项目级顶层文档

| 文档 | 路径 | 说明 |
|---|---|---|
| **文档索引** | [README.md](./README.md) | 本文件 |
| **检查清单** | [SPECS_CHECKLIST.md](./SPECS_CHECKLIST.md) | 文档完成度与本轮验证证据 |
| **项目结构** | [STRUCTURE.md](./STRUCTURE.md) | 目录、模块映射、生成物规则 |
| **技术选型** | [TECH.md](./TECH.md) | 版本锁定值与否决项 |
| **整体架构** | [ARCHITECTURE.md](./ARCHITECTURE.md) | 分层、进程模型、时序、状态机 |
| **宪法原则** | [constitution.md](./constitution.md) | C1–C14，均可检查；含编号分层 |
| **整体规格** | [overall-spec.md](./overall-spec.md) | `FR-APP/RUN/UI/CAP/DATA/DIAG/REL` |
| **整体方案** | [overall-plan.md](./overall-plan.md) | 模块策略、宪法合规、交付流程 |
| **数据模型** | [overall-data-model.md](./overall-data-model.md) | `ReadyInfo`、能力协议、载荷版本 |
| **测试用例索引** | [overall-test-cases.md](./overall-test-cases.md) | `TC-000/1xx…` + 门禁 G1–G13 映射 |

---

## 三、需求模块（000-scaffold）

### 000 — 工程搭建（scaffold）

> Gradle 脚手架 + Kotlin 外壳骨架 + 探针载荷（P0 门禁载体）+ 载荷管线脚本。`000` 为工程基线保留编号（不参与 0XX 公共模块编号）。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [000-scaffold/spec.md](./000-scaffold/spec.md) | `FR-000-*` |
| 技术方案 | [000-scaffold/plan.md](./000-scaffold/plan.md) | 结构决策、偏差登记 |
| 任务清单 | [000-scaffold/tasks.md](./000-scaffold/tasks.md) | 已完成/待办 |
| 测试用例 | [000-scaffold/test-cases.md](./000-scaffold/test-cases.md) | 探针 → 门禁报告流程 |

---

## 四、公共需求模块（0XX）

### 012 — 构建工作流（building-workflow）

> GitHub Actions 云端构建：tag `v*` 触发，引擎投放 → 载荷装配 → APK 构建 → Release 发布；签名材料经 GitHub Secrets 注入。原 `001-building-workflow` 按父工程规则改为 `012`。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [012-building-workflow/spec.md](./012-building-workflow/spec.md) | `FR-012-*` |
| 技术方案 | [012-building-workflow/plan.md](./012-building-workflow/plan.md) | 步骤、锁定、签名注入 |
| 任务清单 | [012-building-workflow/tasks.md](./012-building-workflow/tasks.md) | 已完成/待办 |
| 测试用例 | [012-building-workflow/test-cases.md](./012-building-workflow/test-cases.md) | 本地彩排 + 云端 E2E |

### 013 — 品牌化（branding）

> 应用名、启动图标、圆形图标、通知小图标与 Web 品牌位；物料源为父工程 `assets/`，Web 品牌位由 `205-plugin-branding` 实现。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [013-branding/spec.md](./013-branding/spec.md) | 品牌化功能规格 |
| 技术方案 | [013-branding/plan.md](./013-branding/plan.md) | 品牌化技术实现方案 |

---

## 五、功能模块（编号与 ark 对齐）

| # | 模块 | 目录 | 状态 | 说明 |
|---|---|---|---|---|
| 101 | 运行时启动编排 | [101-runtime-launch-orchestration/](./101-runtime-launch-orchestration/) | 🟡 Partial | `DshRuntime` 状态机已实现；真机取证暂缓（T-002） |
| 102 | 载荷管线 | [102-payload-pipeline/](./102-payload-pipeline/) | 🟡 Partial | 解包/打包脚本完成；载荷随包迭代（2026-10-29 sha12=23b9aaff51a4） |
| 103 | WebView 外壳 | [103-webview-shell/](./103-webview-shell/) | ✅ Delivered | 配置矩阵/围栏/自愈已实现；SAF 文件选择已接（fs.pickFiles/saveFile，T-009 待上游调用方） |
| 104 | 宿主能力桥 | [104-host-capability-bridge/](./104-host-capability-bridge/) | ✅ Delivered | 冻结名 17 项全部落地（12 原有 + clipboard×2/power.keepAwake/fs.pickFiles/saveFile，2026-10-29）；两段式协议 + kind 级 TTL |
| 105 | 上游适配层 | [105-upstream-adapter-bundle/](./105-upstream-adapter-bundle/) | ✅ Delivered | `android` profile + `@dsh-android/bundle` + 垫片 S1–S5 全部随包 |
| 106 | 工作区选择 | [106-workspace-picker/](./106-workspace-picker/) | ✅ Delivered | 三+一主目录、根围栏、权限门（P2 完整版实测） |
| 107 | 诊断与可观测 | [107-diagnostics-observability/](./107-diagnostics-observability/) | 🟡 Partial | `/_android/facts` 已实现（debug-only 门禁，端点 200 实测）；selfcheck 待做 |
| 108 | 合规与发布 | [108-compliance-release/](./108-compliance-release/) | 🟡 Partial | 双 flavor/签名规划已落 Gradle；发布材料待正式签名物料（T-008） |
| 109 | Agent 保活 | [109-agent-keepalive/](./109-agent-keepalive/) | ✅ Delivered | KeepAliveService（dataSync FGS）+ power.keepAwake + 生命周期实证（2026-10-29） |
| 110 | pnpm 集成 | [110-pnpm-integration/](./110-pnpm-integration/) | ✅ Delivered | 内置纯 JS pnpm 10.34.6 + worker 调用器 + desktopPnpm 契约（含 lookup）。原 `012-pnpm-integration` 改号，释放 012 给构建工作流 |
| 111 | PTY 完整终端 | [111-pty-integration/](./111-pty-integration/) | 🟡 Partial | 上架 node-runtime/pty AAR（引擎→26.13.0）+ spawnTerminal(node-pty) + 终端面板解禁；设备端取证待 real-device/模拟器（2026-11-01） |

> 本工程是 1XX 编号基准：`101 runtime-launch` / `102 payload` / `103 webview-shell` / `104 host-capability` / `105 upstream-adapter` / `106 workspace-picker` / `107 diagnostics` / `108 compliance` / `109 agent-keepalive` / `110 pnpm`。

---

## 六、插件模块（2XX）

| # | 模块 | 目录 | 状态 | 说明 |
|---|---|---|---|---|
| 201 | dsh-market | [201-dsh-market/](./201-dsh-market/) | 🟡 Partial | 市场 UI/装/卸链就绪；G6 lookup 待上游 feature-detect（T-001） |
| 204 | GIT 插件 | [204-plugin-git/](./204-plugin-git/) | ✅ Delivered | isomorphic-git 21 工具；clone/push 端到端实证（2026-10-29） |
| 205 | 品牌资产 / Web 品牌位 | [205-plugin-branding/](./205-plugin-branding/) | 🟡 Partial | 启动图标/应用名已定制；Web 侧品牌位需上游 seam（T-006 跟踪） |
| 206 | 纯 JS 搜索 | [206-plugin-fs-search/](./206-plugin-fs-search/) | 🟡 Partial | 进程内 rg 替身已实现（@dsh-android/subprocess 内，T-013）；与真实 rg 偏差登记待收窄 |

---

## 七、模块编号一览

| 编号 | 模块名 | 英文名 | 分类 |
|---|---|---|---|
| 000 | 工程搭建 | scaffold | 工程基线（000 例外） |
| 012 | 构建工作流 | building-workflow | 公共需求 |
| 013 | 品牌化 | branding | 公共需求 |
| 101 | 运行时启动编排 | runtime-launch-orchestration | 基础功能 |
| 102 | 载荷管线 | payload-pipeline | 基础功能 |
| 103 | WebView 外壳 | webview-shell | 基础功能 |
| 104 | 宿主能力桥 | host-capability-bridge | 基础功能 |
| 105 | 上游适配层 | upstream-adapter-bundle | 基础功能 |
| 106 | 工作区选择 | workspace-picker | 基础功能 |
| 107 | 诊断与可观测 | diagnostics-observability | 基础功能 |
| 108 | 合规与发布 | compliance-release | 基础功能 |
| 109 | Agent 保活 | agent-keepalive | 基础功能 |
| 110 | pnpm 集成 | pnpm-integration | 基础功能 |
| 111 | PTY 完整终端 | pty-integration | 基础功能 |
| 201 | dsh-market | dsh-market | 插件 |
| 204 | GIT 插件 | plugin-git | 插件 |
| 205 | 品牌资产 / Web 品牌位 | plugin-branding | 插件 |
| 206 | 纯 JS 搜索 | plugin-fs-search | 插件 |

---

## 八、阅读顺序建议

1. 新人入门：`README.md` → `TECH.md` → `ARCHITECTURE.md` → `docs/000-工程规划.md`
2. 开工一个模块：该模块 `spec.md` → `plan.md` → 对照 `constitution.md` 自检
3. 验收/测试：`overall-test-cases.md` → `000-scaffold/test-cases.md` → `012-building-workflow/test-cases.md` → `docs/010-P0门禁报告.md`
