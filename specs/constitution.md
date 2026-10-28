# 宪法原则（constitution.md）

> 工程：`dsh-desktop-android`
> 版本：v0.1（`000-scaffold`）
> 状态：**约束性文档**。与本文件冲突的实现一律视为缺陷，而不是"另一种风格"。
> 依据：`docs/000-工程规划.md` §1–§5、`deepseek-harness` 上游契约、`@fellow99/node-bridge` 0.2.0 契约、`aosp-node-runtime/runtime.lock.json`。

本文件只写**能被检查**的原则：每条都有"违反时的可观察症状"。不可检查的口号不写入。

---

## 一、产品边界

### C1 上游是唯一事实源，本工程只做装配

- 不 fork、不改写 dsh Web 前端；不做 Jetpack Compose 原生聊天界面。
- 平台适配优先走上游扩展点（profile / bundle / seam 插件）；上游源码补丁为 0 是目标。
- **违反症状**：`deepseek-harness` 工作区出现未登记的改动；`specs/` 里出现"我们改了前端"。

### C2 平台真相不隐藏

- 能力未实现就回 `not-implemented` + `hint`；未注册就回 `unregistered`；不返回伪造的成功。
- 无沙箱、无 PTY、纯 JS 搜索慢一等降级必须在 UI 与文档中显式登记。
- **违反症状**：能力调用返回 `{ok:true}` 但实际没做事；文档写"已支持"却无证据。

### C3 证据优先

- 任何"可用/通过"的结论必须附可复现证据：命令输出、截图、`ready.json`、`/probe.json`、logcat 片段。
- 禁止作为判据：某一条日志、"目录存在"、"看起来生效"、模拟器截图。
- **违反症状**：验收表里只有 ✅ 没有证据链接/片段。

---

## 二、运行时纪律

### C4 单进程、单实例、不可重启

- Node 跑在应用进程内（`node::Start` 每进程一次）；崩溃即终态，只能重启应用。
- 单实例（`launchMode="singleTask"`）；端口必须随机（`--port 0`）。
- **违反症状**：代码里出现"自动重启 Node"；固定端口；多实例争同一 `filesDir`。

### C5 载荷的单一事实链

- 载荷由 `package-payload.mjs` 打包 → Kotlin `PayloadInstaller` 解包 → Node 只读使用；三方必须用同一份 `dsh.version` 的 sha256 对账。
- 资产是**裸 ustar**（AAPT2 会解压 `.gz` 改名——已实测）；契约变更必须同步打包器、解包器与 `TECH.md`。
- **违反症状**：解包后 sha 对账失败；`TarReader` 开始接受 pax/GNU 条目却没人更新打包器。

### C6 路径只用绝对路径

- `DSH_HOME` / `HOME` / `DSH_USER_ROOT` 全部由 Kotlin 绝对路径下发；Node 侧禁止拼 `/sdcard` 或猜相对路径。
- **违反症状**：Node 侧出现 `~/...`、`/sdcard/...` 字面量。

### C7 主线程不作恶

- 主线程绝不 `dlopen`/`node::Start`/大 IO；宿主能力 handler 只做内存/系统查询。
- **违反症状**：ANR trace 里出现 `HostCapabilities`、`PayloadInstaller`。

### C8 失败必须可见且终态化

- 启动链任一阶段失败 → `FAILED` 终态 + 错误页（stage、日志尾、last-crash）+「重启应用」。
- 禁止：静默重试到成功、吞异常后白屏、`Exited` 后仍显示 running。
- **违反症状**：进程活着但页面永远转圈；日志里没有 FAILED 行。

---

## 三、安全与合规

### C9 明文只属于 loopback

- `networkSecurityConfig` 只放行 `127.0.0.1` / `localhost`；`base-config` 保持禁明文；禁止通配域名。
- 壳不解析 token、不写 cookie、不改 Host/Origin；token 只出现在 URL 一次，`ready.json` 读后即删。
- **违反症状**：config 里出现 `domain includeSubdomains="true"`；日志行出现 `?token=`。

### C10 凭据不落盘文档、不进日志

- 任何测试 URL / 用户 / 密码 / API KEY / 凭证**不得**写入仓库任何文件（含 specs、docs、logs 样例）。
- 用户凭据（dsh 设置、`.credentials.yaml`、git 凭据）只落应用私有目录（600）。
- **违反症状**：`grep -r "sk-" specs/ docs/` 有命中；诊断复制文本含 token。

### C11 权限最小化、按需触发

- 冷启不批量弹窗；All-files 仅 `full` flavor 声明；`store` 线 SAF-only。
- **违反症状**：`store` 构建里出现 `MANAGE_EXTERNAL_STORAGE`；启动即请求通知。

### C12 二进制不入库

- `libnode.so`、`libc++_shared.so`、载荷产物、keystore 一律 gitignore；入库的只有脚本、清单、校验值与文档。
- **违反症状**：`git status` 出现 `app/src/main/jniLibs/**`。

---

## 四、工程纪律

### C13 常量单一事实源

- 路径/超时/目录名/能力名只在 `common/Constants.kt`（Kotlin）与各 `spec.md`（文档）出现；两处必须一致。
- **违反症状**：同一个超时数字在代码里出现两次不同值。

### C14 每个能力结构化进出、永不抛

- `host.register` 的 handler：JSON 进、JSON 出；异常 → `{ok:false,error,hint}`；结果 ≤ 64 KiB。
- **违反症状**：桥日志出现 `handler-threw`；能力返回半截 JSON。
