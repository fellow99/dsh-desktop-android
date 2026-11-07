# AGENTS.md — dsh-desktop-android（Android Edition）AI Agent 工作规范

> 本文件定义了本项目（`dsh-desktop-android`，DSH Desktop Android 版）中 AI Agent 必须遵守的规范和工作流程。
> 所有规范均基于本机实际已安装的技能（skills）编写，不含虚构内容。
> 总则见 `~/.agents/AGENTS.md`；工作区总纲见上级 `../AGENTS.md`；本文件为项目级规范，冲突时以本文件为准。

---

## 一、项目背景（必读）

**DSH Desktop（Android 版）** — 在 Android 上以「进程内 Node + 系统 WebView」运行 [deepseek-harness（dsh）](../deepseek-harness) 的桌面交付。

- **版本**：0.2.1（`versionCode` 201）｜ 上游基线 `dsh-v0.2.1-rc.5` ｜ 引擎 libnode **v26.13.0**（small-icu）
- **技术栈**：Kotlin（View 体系）· 系统 WebView · 进程内 `libnode.so`（`node::Start`，JNI 槽位表桥）· dsh Host（HTTP + WebSocket）
- **适配原则**：上游**零补丁** —— `android` profile + `@dsh-android/bundle`（三类 patch 操作）+ 带标记垫片/物化期补丁 + 自建 seam 插件（`packages/*-android`）
- **支持下限**：Android 8.0 / API 26（arm64-v8a）

### 运行模型
```
MainActivity（前台 UI）
  └─ DshRuntime：进程内启动 libnode → dsh Host（仅监听 127.0.0.1:<随机端口>）
  └─ WebShellView（WebView）→ 加载 http://127.0.0.1:<port>/?token=<一次性 token>
  └─ HostCapabilities：Kotlin↔Node 能力桥（冻结名 17 项，JSON 进出、handler 永不抛）
  └─ KeepAliveService：agent turn 运行期 dataSync 前台保活（结束即停）
```

### 仓库结构
| 路径 | 内容 |
|---|---|
| `app/` | Kotlin 外壳：`DshRuntime`、`WebShellView`、`host/HostCapabilities`、`host/KeepAliveService`、`host/PickDelegateActivity` |
| `packages/` | Node 侧 seam 插件：`bundle-android`、`subprocess-android`、`shell-android`、`market-android`、`git-android`、`notify-android`、`facts-android`、`workspace-picker-android`、`open-in-app-android`、`attachment-image-android`、`branding-android`、`sandbox-android` |
| `payload/` | 正式载荷入口：`bootstrap.js` + `host-boot.js` + `shims/`（S1–S5） |
| `profiles/android/` | `android` profile（bundle 引用、npmrc） |
| `scripts/` | `assemble-payload.mjs` / `package-payload.mjs` / `provision-engine.mjs` |
| `specs/` | 规格文档体系（Constitution C1–C14 + overall-* + 000/101–109/012/201–206） |
| `docs/` | 工程规划、能力清单（42 项）、任务登记册（020） |
| `logs/` | 执行轮日志与取证证据（`<YYYYMMDD>-<N>/evidence/`） |

### 关键文档
- `docs/000-工程规划.md`、`docs/安卓环境能力清单.md`（含 D.2 待办 / D.4 门禁 / D.5 任务登记册 T-001…）
- `specs/README.md`（规格索引）、`specs/constitution.md`（C1–C14 宪法：诚实降级 / 零补丁 / 不伪造）

---

## 二、代码地图（CodeGraph）规范 ——【核心】

### 2.1 已建索引
本项目已初始化 `.codegraph/` 代码地图（~495 文件 / ~8,738 节点）。**探索代码必须优先使用 `codegraph-cli`**，回退到 grep + Read 仅用于未覆盖的细节确认。

### 2.2 索引自动更新（post-commit 钩子）——【强制】
- 本工程的 git **`post-commit` 钩子**已安装：每次 commit 后自动执行 `codegraph sync` 增量更新 `.codegraph/`。
- 钩子非阻塞、失败只写日志（`logs/codegraph-sync.log`）、绝不阻断提交。
- Agent 也应在大规模变更后手动 `codegraph sync` 保持索引新鲜。

### 2.3 命令速查
| 场景 | 命令 |
|---|---|
| 探索功能区域 | `codegraph context "<任务描述>"` |
| 查找符号定义 | `codegraph query <符号名>` |
| 变更影响范围 | `codegraph impact <符号名>` |
| 索引状态 / 增量更新 | `codegraph status` / `codegraph sync` |

---

## 三、通用规范

### 3.1 语言
- 与用户交互、编写文档、提交注释使用**中文**；代码、变量、技术术语使用**英文**。

### 3.2 安全
- **严禁**提交密钥、Token、签名凭据（`keystore.properties`、`dsh-desktop-android.keystore`）、口令哈希等敏感信息；`keystore.properties` 等须保持 gitignore。
- 严禁用 `as any` / `@ts-ignore` / `@ts-expect-error` 压制类型错误；严禁空 `catch(e) {}`。

### 3.3 代码质量
- 编辑后运行 `lsp_diagnostics` 检查无新增错误；修复 Bug 只做最小改动；禁止凭空猜测未读取代码行为。

---

## 四、Git 提交规范（强制使用 `git-commit` 技能）

- 提交前先加载 **`git-commit`** 技能；提交注释**必须**用 [Conventional Commits](https://www.conventionalcommits.org/) 格式 `<type>[optional scope]: <description>`。
- 仅允许 type：`feat` / `fix` / `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore` / `revert`。
- 本工程是**子模块**：在本工程内提交后，须回到**父工程**提交新的子模块指针。
- **严禁** `--no-verify` 跳过 Git Hooks（除非用户明确要求）。

---

## 五、开发与质量流程规范

- **鸿蒙侧无关**；本工程为 Android/Kotlin + Node。**Node 侧插件/载荷**开发遵循工作区 `specs-based-devflow` 与 `systematic-debugging`、`requesting-code-review` / `receiving-code-review` 规范。
- 规格化：`specs/` 已有 as-built 规格；新增/变更功能遵循 speckit 技能链（`speckit-specify → plan → tasks`，实现用 `speckit-implement`）。
- **Android 构建**：`./gradlew assembleFullDebug`（侧载）/ `assembleFullRelease`（发布，需签名）。设备验证用 `adb install`。
- 每项能力须对照 `docs/安卓环境能力清单.md` 的诚实降级原则，**不伪造能力**。

---

## 六、技能自检与快速索引

| 任务类型 | 必备技能 |
|---|---|
| Git 提交 | `git-commit` |
| 代码库探索 / 代码地图 | `codegraph-cli` |
| 开发任务（全流程） | `specs-based-devflow` |
| 代码审查 | `requesting-code-review` / `receiving-code-review` |
| 调试 | `systematic-debugging` |
| 产品/需求规划 | `brainstorming` |

---

## 七、违规处理

违反以上任何规范，Agent 必须立即停止、向用户报告、等待指示后再继续。

---

> **最后更新**：2026-11-02
> **维护者**：fellow99
