# 规格检查清单（SPECS_CHECKLIST.md）

> 工程：`dsh-desktop-android`
> 需求：`000-scaffold`（工程搭建）
> 更新：2026-11-01（按父工程编号规则整理：0XX 公共 / 1XX 基础 / 2XX 插件）
> 状态取值：`✅ Done`（已写且有源码/证据）｜`🟡 Partial`（部分实现/部分章节）｜`⬜ Planned`（仅设计）

---

## 一、根目录文档

| # | 文档 | 路径 | 状态 | 证据 / 说明 |
|---|---|---|---|---|
| P-01 | 文档索引 | [README.md](./README.md) | ✅ Done | 全部文档生成后扫描生成 |
| P-02 | 规格检查清单 | [SPECS_CHECKLIST.md](./SPECS_CHECKLIST.md) | ✅ Done | 本文件 |
| P-03 | 目录结构 | [STRUCTURE.md](./STRUCTURE.md) | ✅ Done | 按 `find` 实际结果生成 |
| P-04 | 技术选型 | [TECH.md](./TECH.md) | ✅ Done | 版本锁定值来自 libs.versions.toml / runtime.lock.json；含偏差登记 |
| P-05 | 整体架构 | [ARCHITECTURE.md](./ARCHITECTURE.md) | ✅ Done | 分层与状态机与代码一致 |
| P-06 | 宪法原则 | [constitution.md](./constitution.md) | ✅ Done | C1–C14，均可检查；含编号分层 |
| P-07 | 整体规格 | [overall-spec.md](./overall-spec.md) | ✅ Done | FR-APP/RUN/UI/CAP/DATA/DIAG/REL，状态逐条标注 |
| P-08 | 整体技术方案 | [overall-plan.md](./overall-plan.md) | ✅ Done | 含宪法合规表与偏差登记 |
| P-09 | 数据模型 | [overall-data-model.md](./overall-data-model.md) | ✅ Done | ready.json / 能力协议 / 载荷版本 / env 表 |
| P-10 | 测试用例索引 | [overall-test-cases.md](./overall-test-cases.md) | ✅ Done | L0 已跑 ✅；L1 待真机；L4-1 例行扫描 |

> 按需求约定，不生成 `API.md` 与 `overall-api.md`。

---

## 二、需求模块（000-scaffold）

| # | 模块 | spec | plan | tasks | test-cases | 状态 | 源码落点 / 证据 |
|---|---|---|---|---|---|---|---|
| M-000 | 工程搭建 | [spec](./000-scaffold/spec.md) | [plan](./000-scaffold/plan.md) | [tasks](./000-scaffold/tasks.md) | [test-cases](./000-scaffold/test-cases.md) | 🟡 Partial | 脚手架/外壳/脚本/文档 ✅；真机探针 F1–F4 待设备 |

---

## 三、公共需求模块（0XX）

| # | 模块 | spec | plan | tasks | test-cases | 状态 | 源码落点 / 证据 |
|---|---|---|---|---|---|---|---|
| M-012 | 构建工作流（GitHub Actions） | [spec](./012-building-workflow/spec.md) | [plan](./012-building-workflow/plan.md) | [tasks](./012-building-workflow/tasks.md) | [test-cases](./012-building-workflow/test-cases.md) | ✅ Done | `.github/workflows/android-build.yml` + 版本注入；tag v0.2.1 → Run #6/#7 全绿 |
| M-013 | 品牌化（应用级） | [spec](./013-branding/spec.md) | [plan](./013-branding/plan.md) | — | — | ✅ Done | `scripts/generate-brand-assets.py` + `res/mipmap-*` / `res/drawable-*`；Web 品牌位归 205 |

---

## 四、功能模块（1XX）

| # | 模块 | spec.md | plan.md | 状态 | 源码落点 / 证据 |
|---|---|---|---|---|---|
| M-101 | 运行时启动编排 | [spec](./101-runtime-launch-orchestration/spec.md) | [plan](./101-runtime-launch-orchestration/plan.md) | 🟡 Partial | `DshRuntime.kt`/`Probe.kt`；真机取证待门禁报告 |
| M-102 | 载荷管线 | [spec](./102-payload-pipeline/spec.md) | [plan](./102-payload-pipeline/plan.md) | 🟡 Partial | 打包/解包/引擎投放 ✅（L0 六项证据）；上游装配与垫片 ⬜ P1 |
| M-103 | WebView 外壳 | [spec](./103-webview-shell/spec.md) | [plan](./103-webview-shell/plan.md) | ✅ Delivered | `WebShellView.kt`；SAF 文件选择已接 |
| M-104 | 宿主能力桥 | [spec](./104-host-capability-bridge/spec.md) | [plan](./104-host-capability-bridge/plan.md) | ✅ Delivered | `HostCapabilities.kt`；冻结名 17 项 |
| M-105 | 上游适配层 | [spec](./105-upstream-adapter-bundle/spec.md) | [plan](./105-upstream-adapter-bundle/plan.md) | ✅ Delivered | `android` profile + `@dsh-android/bundle` + 垫片 S1–S5 |
| M-106 | 工作区选择 | [spec](./106-workspace-picker/spec.md) | [plan](./106-workspace-picker/plan.md) | ✅ Delivered | 三+一主目录、根围栏、权限门 |
| M-107 | 诊断与可观测 | [spec](./107-diagnostics-observability/spec.md) | [plan](./107-diagnostics-observability/plan.md) | 🟡 Partial | `/_android/facts` 已实现；selfcheck 待做 |
| M-108 | 合规与发布 | [spec](./108-compliance-release/spec.md) | [plan](./108-compliance-release/plan.md) | 🟡 Partial | 双 flavor/签名规划已落 Gradle；发布材料待正式签名物料 |
| M-109 | Agent 保活 | [spec](./109-agent-keepalive/spec.md) | [plan](./109-agent-keepalive/plan.md) | ✅ Delivered | KeepAliveService（dataSync FGS）+ power.keepAwake |
| M-110 | pnpm 集成（原 012） | [spec](./110-pnpm-integration/spec.md) | [plan](./110-pnpm-integration/plan.md) | ✅ Delivered | 纯 JS pnpm 10.34.6 + worker 调用器 + desktopPnpm 契约 |

---

## 五、插件模块（2XX）

| # | 模块 | spec.md | plan.md | 状态 | 源码落点 / 证据 |
|---|---|---|---|---|---|
| M-201 | dsh-market | [spec](./201-dsh-market/spec.md) | [plan](./201-dsh-market/plan.md) | 🟡 Partial | 市场 UI/装/卸链就绪；G6 lookup 待上游 feature-detect |
| M-204 | GIT 插件 | [spec](./204-plugin-git/spec.md) | [plan](./204-plugin-git/plan.md) | ✅ Delivered | isomorphic-git 21 工具；clone/push 端到端实证 |
| M-205 | 品牌资产 / Web 品牌位 | [spec](./205-plugin-branding/spec.md) | [plan](./205-plugin-branding/plan.md) | 🟡 Partial | 应用图标/名称已定制；Web 品牌位已移植（T-006 跟踪） |
| M-206 | 纯 JS 搜索 | [spec](./206-plugin-fs-search/spec.md) | [plan](./206-plugin-fs-search/plan.md) | 🟡 Partial | 进程内 rg 替身已实现；与真实 rg 偏差登记待收窄 |

---

## 六、本轮（000-scaffold）验证证据

| 项 | 结果 | 证据 |
|---|---|---|
| 引擎 v24.22.1 投放 | ✅ | `provision-engine.mjs`：libnode.so sha256/size ✓（八项 ELF 门禁由 aosp-node-runtime provision.mjs 出示） |
| 载荷打包 | ✅ | `package-payload.mjs`：dsh.tar / sha256；`tar -tvf` 合法 |
| APK 构建 | ✅ | `assembleFullDebug` BUILD SUCCESSFUL |
| 16 KB 对齐 | ✅ | `zipalign -c -P 16 4 <apk>` 通过 |
| APK 内容 | ✅ | 4 个 .so（libnode/libc++_shared/libnode_bridge/libnode_host_client）+ assets/dsh-payload/{dsh.tar,dsh.version} |
| 二进制不入库 | ✅ | `.gitignore`（jniLibs/dsh-payload/node_modules） |
| 代码评审 | ✅ | 外部子代理评审（requesting-code-review）→ receiving-code-review 逐条核实；证据见 `logs/20261027-1/REVIEW_REPORT.md` |
| 敏感信息扫描 | ✅ | `grep -rnIE "sk-…\|password=\|Bearer …\|api_key="` 无命中（C10） |
| 模拟器部署 + 门禁 + 功能用例 | ✅ | G4/G3/G1 ✅；对话与看图分析 Completed；证据 `docs/010-P0门禁报告.md` + `logs/20261027-2/evidence/` |

## 七、遗留与下一步

1. **真机探针取证**（F1–F4）→ `docs/010-P0门禁报告.md` → 探针清理。
2. P1：正式载荷装配管线 + `android` profile + host.js/垫片 → 一次完整对话（TC-L2-1..6）。
3. P2：宿主能力补齐 + 两段式异步；P3：生态；P4：签名分发。
4. 真机回归（当前 0.1.0 为模拟器验证）。
