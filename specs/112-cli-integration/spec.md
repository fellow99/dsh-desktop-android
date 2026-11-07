# 112 · CLI 集成：引入 node / python / git 等运行程序（spec.md）

> 状态：⬜ Planned ｜ 依据：`docs/aosp+node+python+git运行方案.md`（R1 随包 CLI 主线）、`../../node-bridge-workspace/docs/aosp+node+python+git运行方案.md`
> 需求编号：**112-cli-integration** ｜ 需求名称：引入 node、python、git 等运行程序
> 上游基线：`dsh-v0.2.1-rc.5` ｜ 引擎 libnode **v26.13.0** ｜ 配套 CLI 五件：node / python / git / uv / pnpm
> 分发：**第 1 轮 GitHub Release 归档下载部署**；第 2 轮（规划中，不落地）转 Maven Central
> 规格落点：本文件（`dsh-desktop-android/specs/112-cli-integration/`，不入父工程 specs）

## 一、目标

在第 1 轮从五个相关库（aosp-node-cli / aosp-python-cli / aosp-git-cli / aosp-uv-cli / aosp-pnpm-cli）的
GitHub Release 下载各自已打包好的二进制，部署到本应用运行环境（`nativeLibraryDir` + assets 物化 +
环境引导层），使 **Agent 上下文中 node（含 npm/npx）、pnpm、python（含 pip）、uv、git 这些命令与
桌面端用法一致（可 spawn、可走 PATH、可进 PTY 终端）**；并以此替换两处纯 JS 替代方案：

- `204-plugin-git`（isomorphic-git 21 工具）→ 集成 **aosp-git-cli**（真实 `git` 二进制，并精简为**单一 `git` passthrough 工具**）
- `110-pnpm-integration`（pnpm v10 纯 JS worker）→ 集成 **aosp-pnpm-cli**（真实 pnpm 二进制，保留 desktopPnpm 契约）

> 边界声明（C2 诚实降级，写进能力标志，绝不静默降级）：
> - 无编译器（无 gcc/make）；仅纯 JS / 纯 Python wheel 与随包原生件可用；sdist / node-gyp 原生扩展不可本地构建。
> - git 仅 http(s) 传输；ssh 远程（`git@…`）不在本轮范围（aosp-git-cli 侧二期）。
> - 仅 arm64-v8a（引擎与 CLI 一致）。

## 二、功能需求

### FR-112-1 CLI 五件套随包
- **FR-112-1a** `libnode_cli.so`（含 libnpm.so / libnpx.so / libcorepack.so 壳入口）与 npm/corepack JS 树随包。
- **FR-112-1b** `libpython_cli.so`（含 libpip.so / libpip3.so）与纯 Python stdlib + ensurepip + CA bundle 随包。
- **FR-112-1c** `libgit_cli.so`（含 `libgit_http_fetch.so` / `libgit_remote_curl.so` remote helper）与 git 模板 + CA bundle 随包。
- **FR-112-1d** `libuv_cli.so` 随包。
- **FR-112-1e** `libpnpm_cli.so` 随包（运行期依赖 node 在 PATH — aosp-pnpm-cli 声明）。
- **FR-112-1f** 版本锁定：node=26.13.0（与引擎配对）· python=3.14.10 · git=2.56.0 · uv=0.13.6 · pnpm=12.16.1；归档 SHA-256 与 Release 官方值一致（事实源 `cli.lock.json`）。

### FR-112-2 部署到运行环境
- **FR-112-2a** exec 型 `.so` 进入 `app/src/main/jniLibs/arm64-v8a/`，经 `useLegacyPackaging=true` 物理落盘 `nativeLibraryDir`（exec 前提，C4）。
- **FR-112-2b** JS/python/git 数据资产进入载荷（assets 不是文件系统路径，必须幂等物化到 `filesDir`，复用现有 payload 解包管线）。
- **FR-112-2c** 二进制/大资产不入库（`.gitignore`，镜像 provision-engine 纪律）；`scripts/provision-cli.mjs` 负责下载→校验→投放→check。

### FR-112-3 Agent 上下文可用
- **FR-112-3a** 环境引导层注入 `PATH`（含 `nativeLibraryDir` 与 `$HOME/bin`）、`LD_LIBRARY_PATH`（nativeLibraryDir，供给 libc++/bz2 等）、`HOME`、`TMPDIR`、`SSL_CERT_FILE`、`GIT_CONFIG_GLOBAL`、`GIT_TEMPLATE_DIR`、`PYTHONHOME`/`PYTHONPATH`、npm registry 等；`$HOME/bin` 命令符号链接农场（`node`/`npm`/`pnpm`/`python`/`pip`/`uv`/`git` 及 git remote helper 名）。
- **FR-112-3b** `@dsh-android/subprocess` 执行护栏扩展：放行 `nativeLibraryDir` 下 CLI 二进制（并按命令名经 PATH 解析）；默认 PATH 由环境引导层提供，不再只系统目录。
- **FR-112-3c** Agent 上下文中 `node -v` / `npm -v` / `npx` / `pnpm -v` / `python --version` / `pip --version` / `uv --version` / `git --version` 均可用（bash 工具、spawn、PTY 终端三条路）。
- **FR-112-3d** 能力诚实上报：CLI 缺失/加载失败结构化上报（宪法 C2），不伪造版本号。

### FR-112-4 替换 204-plugin-git（isomorphic-git → aosp-git-cli，并精简工具族）
- **FR-112-4a** 精简工具族：21 个按动词封装的工具 → **单一 `git` passthrough 工具**（`argv`（`git` 之后的命令行）＋可选 `dir`/`timeoutMs`；返回 `code`/`root`/`stdout`/`stderr`）。LLM 已精通 git 命令，无需为每个动词维护 Schema/渲染；**非零退出码如实返回**（`git diff --exit-code`/`git status --short` 返回 1 是模型需要的值，不是错误）。
- **FR-112-4b** 执行：`git` 工具把 argv 交给真实 `git` 二进制（`git-exec.js` 经 `node:child_process` spawn，工作目录＝围栏裁决的仓库根）：**argv 护栏**拒绝 `--git-dir`/`--work-tree`/`--exec-path`/`--separate-git-dir`/`--config-env=`，`-C` 绝对路径必须在根内（相对子目录放行）。
- **FR-112-4c** 凭据链路迁移：凭据设置页/`GIT_CREDENTIAL_<HOST>` 存储保留；`git` 工具 spawn 前为 argv 中的 http(s) URL **前置 mirror**（`credentials.lookup` → 写 `$HOME/.git-credentials`，0600、临时文件＋rename，宪法纪律：参数/日志不得出现口令明文）；真实 `git` 经 `credential.helper=store --file=…` 读取。
- **FR-112-4d** 围栏（Fence：仓库根裁决＋越区升级审批）、超时（networkTimeoutMs/timeoutMs）、错误脱敏（scrub url/凭据）、「认证缺失→提示 `GIT_CREDENTIAL_<HOST>`」「非仓库→提示 `git init`」两类失败映射——行为与现有一致。
- **FR-112-4e** 移除 isomorphic-git 闭包随包（`packages/git-android/node_modules/isomorphic-git` 不再物化）与 `loadGit()` 纯 JS 通路；删除 21 工具实现与 `toolkit/report/diff/fs-adapter/merge-worktree/runtime` 等纯 JS 残留模块；`SPECS/204-plugin-git/spec.md` 内容替换为本文档集成声明。

### FR-112-5 替换 110-pnpm-integration（pnpm v10 → aosp-pnpm-cli）
- **FR-112-5a** 保留 `desktopPnpm` 契约（install / lookup 等成员），后端由纯 JS worker 改为真实 `pnpm` 二进制。
- **FR-112-5b** `DSH_PNPM_ENGINE` 指向 `libpnpm_cli.so`（或 `$HOME/bin/pnpm` 符号链接）；pnpm 运行期依赖 node 在 PATH（FR-112-3a 保证）。
- **FR-112-5c** pnpm 布局配置（nodeLinker hoisted、storeDir 等）沿用现有 `pnpm-workspace.yaml` 生成逻辑；storeDir 绝对路径。
- **FR-112-5d** 移除纯 JS pnpm v10 引擎（`dsh-market-pnpm/bin/pnpm.cjs` 不再随包/不再作为 DSH_PNPM_ENGINE）；`SPECS/110-pnpm-integration/spec.md` 内容替换为本文档集成声明。

## 三、验收与测试

- 用例索引：`test-cases.md`（TC-112-*），真机（arm64-v8a，API 30）端到端取证；证据落 `logs/<YYYYMMDD>-<N>/evidence/`。
- 验收内容包括：CLI 五件套版本可用（FR-112-3c 判据）、git 工具（passthrough）经真实 git 二进制闭环（clone/push 端到端）、pnpm install/lookup 经真实 pnpm 二进制闭环、既有 L2 功能（设置 API KEY / deepseek-flash / 建工作区 / 对话 / 看图分析）不回归。
- 证据纪律：宪法 C3（命令输出/截图/`/_android/facts` 字段为唯一判据）。

## 四、成功准则（可测、技术无关）

1. 升级安装后，用户可在 Agent 上下文（bash 工具或终端面板）运行 `node -v`、`npm -v`、`pnpm -v`、`python --version`、`uv --version`、`git --version`，均回真实版本号。
2. 用户可在设置页配置 DeepSeek API KEY，用 `deepseek-flash` 创建会话、建立工作区、完成一次对话（「介绍一下你自己」），并完成一次看图分析，全程不回归。
3. git 工具（passthrough）在真实 git 二进制支撑下 clone/push 端到端可用；pnpm 在真实 pnpm 二进制支撑下 install/lookup 可用。
4. 应用安全纪律不变：API KEY / 口令等敏感信息不落盘任何规格/测试/文档文件；日志不泄漏 token 与凭据。
5. 卸载的纯 JS 替代（isomorphic-git、pnpm v10）无残留引用；规格 `204`/`110` 已指向本需求。

## 五、范围外（本轮不落地）

- Maven Central 获取（第 2 轮规划）。
- git ssh 远程、bash 独立二进制、openssh/dropbear。
- 非 arm64-v8a ABI、sdist/node-gyp 原生编译支持。
- 体积治理（Play 动态特性模块）。
