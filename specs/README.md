# 规格文档索引（specs/README.md）

**项目名称：** DSH Desktop（Android 版） · `dsh-desktop-android`
**版本：** 0.1.0（`versionCode` 1）
**上游基线：** `deepseek-harness` `dsh-v0.2.1-rc.2` ｜ 引擎 Node **v24.22.1**（`aosp-node-runtime`，jniLibs 投放）｜ 桥 `node-bridge` **0.2.0**（Maven Central：`io.github.fellow99:node-bridge`）

**技术栈：** Kotlin（View 体系）· 系统 WebView · 进程内 `libnode.so`（`node::Start`，JNI 槽位表桥）· dsh Host（HTTP + WebSocket）
**文档生成时间：** 2026-10-27 ｜ **最后更新：** 2026-10-27 ｜ **对应需求：** `000-scaffold`

---

## 一、文档总览

| 层级 | 分类 | 文档数量 | 说明 |
|---|---|---|---|
| 整体 | 项目级顶层文档 | 6 | 索引、清单、结构、技术、架构、宪法 |
| 整体 | 整体规格文档 | 4 | `overall-*` 系列 |
| 需求 | `000-scaffold`（工程搭建） | 4 | spec / plan / tasks / test-cases |
| 模块 | 运行时与外壳（101–104、109） | 目录骨架 | 每模块 `spec.md` + `plan.md` |
| 模块 | 适配与发布（105–108） | 目录骨架 | 每模块 `spec.md` + `plan.md` |
| 模块 | 生态（012、201、204、205、206） | 目录骨架 | 每模块 `spec.md`（`⬜ Planned`） |
| **合计** | **10 根文件 / 1 需求目录 / 15 模块目录** | | |

> 按需求约定，不生成 `API.md` 与 `overall-api.md`。
> 本工程与 `dsh-desktop-ark` **架构同构、编号对齐**（便于互译）；平台事实（桥形态、载荷解包、权限模型）全部换成 Android 侧，见 `docs/000-工程规划.md`。

---

## 二、项目级顶层文档

| 文档 | 路径 | 说明 |
|---|---|---|
| **文档索引** | [README.md](./README.md) | 本文件 |
| **检查清单** | [SPECS_CHECKLIST.md](./SPECS_CHECKLIST.md) | 文档完成度与本轮验证证据 |
| **项目结构** | [STRUCTURE.md](./STRUCTURE.md) | 目录、模块映射、生成物规则 |
| **技术选型** | [TECH.md](./TECH.md) | 版本锁定值与否决项 |
| **整体架构** | [ARCHITECTURE.md](./ARCHITECTURE.md) | 分层、进程模型、时序、状态机 |
| **宪法原则** | [constitution.md](./constitution.md) | C1–C14，均可检查 |

### 整体规格文档

| 文档 | 路径 | 说明 |
|---|---|---|
| **整体规格** | [overall-spec.md](./overall-spec.md) | `FR-APP/RUN/UI/CAP/DATA/DIAG/REL` |
| **整体方案** | [overall-plan.md](./overall-plan.md) | 模块策略、宪法合规、交付流程 |
| **数据模型** | [overall-data-model.md](./overall-data-model.md) | `ReadyInfo`、能力协议、载荷版本 |
| **测试用例索引** | [overall-test-cases.md](./overall-test-cases.md) | `TC-000/1xx…` + 门禁 G1–G13 映射 |

---

## 三、需求模块

### 000 — 工程搭建（scaffold）

> Gradle 脚手架 + Kotlin 外壳骨架 + 探针载荷（P0 门禁载体）+ 载荷管线脚本。本目录随需求 `000-scaffold` 交付。

| 文档 | 链接 | 说明 |
|---|---|---|
| 功能规格 | [000-scaffold/spec.md](./000-scaffold/spec.md) | `FR-000-*` |
| 技术方案 | [000-scaffold/plan.md](./000-scaffold/plan.md) | 结构决策、偏差登记 |
| 任务清单 | [000-scaffold/tasks.md](./000-scaffold/tasks.md) | 已完成/待办 |
| 测试用例 | [000-scaffold/test-cases.md](./000-scaffold/test-cases.md) | 探针 → 门禁报告流程 |

---

## 四、功能模块（编号与 ark 对齐）

| # | 模块 | 目录 | 状态 | 说明 |
|---|---|---|---|---|
| 101 | 运行时启动编排 | [101-runtime-launch-orchestration/](./101-runtime-launch-orchestration/) | 🟡 Partial | `DshRuntime` 状态机已实现；真机取证待门禁报告 |
| 102 | 载荷管线 | [102-payload-pipeline/](./102-payload-pipeline/) | 🟡 Partial | 解包/打包脚本完成；真实上游载荷未装配 |
| 103 | WebView 外壳 | [103-webview-shell/](./103-webview-shell/) | 🟡 Partial | 配置矩阵/围栏/自愈已实现；文件选择与下载待接 |
| 104 | 宿主能力桥 | [104-host-capability-bridge/](./104-host-capability-bridge/) | 🟡 Partial | 首批 6 能力注册；16 项冻结面未齐 |
| 105 | 上游适配层 | [105-upstream-adapter-bundle/](./105-upstream-adapter-bundle/) | ⬜ Planned | `android` profile + `@dsh-android/bundle` |
| 106 | 工作区选择 | [106-workspace-picker/](./106-workspace-picker/) | ⬜ Planned | 三+一主目录、根围栏、权限门 |
| 107 | 诊断与可观测 | [107-diagnostics-observability/](./107-diagnostics-observability/) | ⬜ Planned | `/_android/facts`、selfcheck |
| 108 | 合规与发布 | [108-compliance-release/](./108-compliance-release/) | 🟡 Partial | 双 flavor/签名规划已落 Gradle；发布材料未做 |
| 109 | Agent 保活 | [109-agent-keepalive/](./109-agent-keepalive/) | ⬜ Planned | 前台服务与通知 |
| 012 | pnpm 集成 | [012-pnpm-integration/](./012-pnpm-integration/) | ⬜ Planned | 内置纯 JS pnpm + worker 调用器 |
| 201 | dsh-market | [201-dsh-market/](./201-dsh-market/) | ⬜ Planned | 市场契约对接与装/卸闭环 |
| 204 | GIT 插件 | [204-plugin-git/](./204-plugin-git/) | ⬜ Planned | isomorphic-git 21 工具 |
| 205 | 品牌资产 | [205-plugin-branding/](./205-plugin-branding/) | ⬜ Planned | 图标/名称/首启门禁 |
| 206 | 纯 JS 搜索 | [206-plugin-fs-search/](./206-plugin-fs-search/) | ⬜ Planned | 内容搜索后端替换 |

---

## 五、阅读顺序建议

1. 新人入门：`README.md` → `TECH.md` → `ARCHITECTURE.md` → `docs/000-工程规划.md`
2. 开工一个模块：该模块 `spec.md` → `plan.md` → 对照 `constitution.md` 自检
3. 验收/测试：`overall-test-cases.md` → `000-scaffold/test-cases.md` → `docs/010-P0门禁报告.md`
