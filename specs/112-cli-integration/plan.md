# 112 · CLI 集成：引入 node / python / git 等运行程序（plan.md）

> 状态：⬜ Planned ｜ 对应 spec：`./spec.md` ｜ 依据：`docs/aosp+node+python+git运行方案.md`（R1 主线）
> 分发：第 1 轮 GitHub Release 归档（验证过的 5 个 `.tar.gz`，SHA-256 与 Release 官方值一致）

## 方案要点（对齐运行方案 §4 公共基础设施）

### D1 CLI 五件套版本与出处（事实源 `cli.lock.json`）

| 工具 | 仓库 | 版本 | 归档 | 产物 | 校验 sha256（已验证） |
|---|---|---|---|---|---|
| node | aosp-node-cli | 26.13.0 | `node-cli-v26.13.0-android-arm64-v8a.tar.gz` | `libnode_cli.so` `libnpm.so` `libnpx.so` `libcorepack.so` + `node-bridge-tools/{npm,corepack}` | `60d7d89919f9…` |
| python | aosp-python-cli | 3.14.10 | `python-cli-v3.14.10-android-arm64-v8a.tar.gz` | `libpython_cli.so` `libpip.so` `libpip3.so` + `stdlib-assets/` | `b4b90341bfad…` |
| git | aosp-git-cli | 2.56.0 | `git-cli-v2.56.0-android-arm64-v8a.tar.gz` | `libgit_cli.so` `libgit_http_fetch.so` `libgit_remote_curl.so` + `assets/git-bridge-tools/` | `001aae771e11…` |
| uv | aosp-uv-cli | 0.13.6 | `uv-cli-v0.13.6-android-arm64-v8a.tar.gz` | `libuv_cli.so` | `d3bfc4d30b3e…` |
| pnpm | aosp-pnpm-cli | 12.16.1 | `pnpm-cli-v12.16.1-android-arm64-v8a.tar.gz` | `libpnpm_cli.so` | `cbd6f3481362…` |

> 第 2 轮（规划）：同一版本线投放到 Maven Central（`io.github.fellow99:{node,node-cli,python,git,uv,pnpm}-cli`），届时改为 `runtimeOnly` AAR 依赖 + `extra-artifacts` 拿 assets；本规划预留 `cli.lock.json` 版本字段便于迁移。

### D2 部署与投放

- **新增 `scripts/provision-cli.mjs`**（镜像 `provision-engine.mjs`）：
  - 下载/本地归档两种来源；`--check` 校验当前状态；sha256+size 与 `cli.lock.json` 比对，不符退 2；
  - 解包归一化：
    - `.so`（exec 型）×12 → `app/src/main/jniLibs/arm64-v8a/`；
    - 数据资产 → `app/src/main/assets/cli/`（`node-bridge-tools/` `stdlib-assets/` `git-bridge-tools/` + 各自的 LICENSE 通知）；
    - 记录 `gate-report`（ELF 形态 / PT_INTERP / 16KB / DT_NEEDED 白名单）随投放落 `cli.gates.json`。
  - 二进制不入库：`.gitignore` 追加 `app/src/main/jniLibs/arm64-v8a/lib*_cli.so`、`libnpm.so`、`libnpx.so`、`libcorepack.so`、`libpip*.so`、`libgit_*.so`、`libuv_cli.so`、`libpnpm_cli.so` 与 `app/src/main/assets/cli/`。

### D3 载荷资产 + 物化

- **assemble-payload.mjs** 新增一步：把 `app/src/main/assets/cli/` 拷进载荷 stage `root/dsh/cli-data/`（npm 树 / python stdlib / git 模板 / cacert）。随既有 payload 管线一并对账（sha256 进入 `dsh.version` 计算链）。
- Kotlin 沿用 `PayloadInstaller`（无需新解包器），CLI 数据随 payload 幂等物化到 `<filesDir>/payload/<sha12>/dsh/cli-data/`；env 下发 `DSH_CLI_DATA_DIR` 与既有 `DSH_ANDROID_NATIVE_LIB_DIR`。

### D4 环境引导层（Node 侧，host-boot 或新 cli 插件）

新增 `payload/cli-env.js`（bootstrap 登记）或并入 `host-boot.js`，幂等导出到 `process.env`：

```
NLDIR          = process.env.DSH_ANDROID_NATIVE_LIB_DIR
CLI_DATA       = process.env.DSH_CLI_DATA_DIR            # <payload>/dsh/cli-data
HOME_BIN       = <dshHome>/bin
PATH           = NLDIR : HOME_BIN : HOME_BIN/link : 原 PATH
LD_LIBRARY_PATH= NLDIR
SSL_CERT_FILE  = CLI_DATA/git-bridge-tools/cacert.pem  # node/git 共用（python 用自己 stdlib-assets/cacert.pem）
GIT_CONFIG_GLOBAL = HOME/.gitconfig
GIT_TEMPLATE_DIR  = CLI_DATA/git-bridge-tools/templates
PYTHONHOME / PYTHONPATH = CLI_DATA/stdlib-assets
npm_config_registry     = DSH_ANDROID_REGISTRY（缺省 npmmirror）
```

- **符号链接农场**：首启在 `$HOME/bin` 建软链：`node→$NLDIR/libnode_cli.so`、`npm→libnpm.so`、`npx→libnpx.so`、`corepack→libcorepack.so`、`python→libpython_cli.so`、`python3→…`、`pip→libpip.so`、`pip3→libpip3.so`、`uv→libuv_cli.so`、`pnpm→libpnpm_cli.so`、`git→libgit_cli.so`；以及 git remote helper 名 `git-http-fetch→libgit_http_fetch.so`、`git-remote-https→libgit_remote_curl.so`、`git-remote-http→…`（git 按 `<exec-path>`/PATH 查子程序）。C1 语义：SELinux 只查目标标签（nativeLibraryDir apk_data_file 放行）。
- **幂等**：`$HOME/bin/.cli-farm-ready` marker；失败只记日志（不阻断 Host 启动）。

### D5 子进程护栏扩展（@dsh-android/subprocess）

- `SYSTEM_BIN_ROOT` 之外追加 `NATIVE_LIB_DIR_ROOT`（读 `DSH_ANDROID_NATIVE_LIB_DIR`）；`isAllowedExecutable` 放行 `NLDIR/**`（canonical 后前缀判定，防 symlink 走私）。
- `DEFAULT_PATH` 改为「引导层已注入的 `process.env.PATH` 优先，回退原系统路径」；`buildChildEnv` 的 `PATH` 转发已在 allowlist（不变）。
- **git 插件与 bash 工具共用该 spawn 通路**：CLI 二进制经 node:child_process spawn（非 pty）时同样经 `resolveProgram` + 护栏。

### D6 替换 204-plugin-git（真实 git 二进制后端）

- 新增 `packages/git-android/lib/git-exec.js`：把 21 工具公共的「isomorphic-git API 调用」替换为「栅栏化 spawn 真实 `git`（argv 构造 + 环境注入 + 超时 + 输出采集...abort）」。
- `lib/runtime.js`：`loadGit()` 由 `import('isomorphic-git')` 改为 `loadGitBinary()`（解析 `$NLDIR/libgit_cli.so` / PATH `git`；缺失→结构化错误，含 remedy）。
- 各 `tools/*.js` 内 isomorphic-git 调用替换为 git 子进程调用，保持 Schema/脱敏/超时/围栏语义；`output` 渲染不动。
- 凭据：`lib/auth.js` `GitCredentials.callbacks()` 语义迁移为「写 `$HOME/.git-credentials`（0600；temporary+rename）或将 `GIT_ASKPASS` 指向一次性回调」；`git-credentials.js` 配置页存储契约不变（`GIT_CREDENTIAL_<HOST>`）。
- `assemble-payload.mjs` 移除 `collectGitRuntime()`（isomorphic-git 物化）；`specs/204-plugin-git/spec.md` 改为集成声明（指向本需求）。

### D7 替换 110-pnpm-integration（真实 pnpm 二进制后端）

- `host-boot.js#configureMarketRuntime`：`DSH_PNPM_ENGINE` 由 `dsh-market-pnpm/bin/pnpm.cjs` 改为 `$HOME/bin/pnpm` 软链（→ libpnpm_cli.so）；`pnpm-workspace.yaml` 生成逻辑保留。
- `packages/market-android` 的 desktopPnpm worker：由「load pnpm.cjs in worker_threads」改为「spawn pnpm 二进制」，契约成员（install/lookup/…）逐字保留；输出/退出码语义对齐（worker exitCode 判据 → 子进程 exitCode）。
- `specs/110-pnpm-integration/spec.md` 改为集成声明（指向本需求）。

### D8 测试与门禁

- 真机（已连接：小米 M2105K81C，API 30，arm64-v8a，Asia/Shanghai，已装 dsh）+ 备选 AVD Pixel_10（16KB 页）。
- 门禁对照 D.3/D.4（G1–G13/L2），重点：CLI 版本可用（新 G-CLI）、git 21 工具闭环、pnpm install/lookup 闭环、L2-2..5 不回归。
- 敏感信息：API KEY / 口令不入任何文档；测试凭据只在设备会话内注入（UI 设置页），不留盘（C10）。

## 依赖

- 上游：dsh-v0.2.1-rc.5；aosp-*-cli 五件（GitHub Release，第 1 轮）；node-pty 26.13.0（PTY 通路）；node-runtime 26.13.0（libc++_shared 供给方，pnpm/uv CLI 依赖）
- 相关库：`d:/node-bridge-workspace/`（aosp-node-cli / aosp-python-cli / aosp-git-cli / aosp-uv-cli / aosp-pnpm-cli）
- Android 环境：`d:/android-workspace/android-studio`；SDK `C:/Users/fello/AppData/Local/Android/Sdk`
- 宪法：C1（零补丁，全走 bundle/垫片/插件）、C2（加载失败结构化上报，不伪造）、C3（证据优先）、C5（载荷单一事实链）、C9/C10（脱敏）

## 风险与对策

| 风险 | 对策 |
|---|---|
| git remote helper 名字/exec-path 解析不到 | `$HOME/bin` 农场按 git 已知 helper 名建软链 + PTY/bash 内实测 `git clone https` 链路 |
| pnpm 运行期需 node（lifecycle scripts） | 农场同时链 node，PATH 前置 NLDIR+HOME_BIN（D4），pnpm install 前 `node -v` 探针 |
| Python `PYTHONHOME/PYTHONPATH` 注入错误导致 import 失败 | 首启探针：`python -c "import sys; print(sys.version)"` 写 facts；失败降级注销 python 能力（C2） |
| 模拟器/真机 `execve` ENOENT（C3 useLegacyPackaging） | 已 `useLegacyPackaging=true`（111 已证）；真机 `ls nativeLibraryDir` + exec 探针先行 |
| 体积：CLI 五件 ≈ 190MB 归档（解包后 ~90MB jniLibs assets 增量） | 本轮接受（debug 包观测），体积治理列范围外（Play 动态特性） |
| 21 工具接口回归 | 逐工具对照旧 Schema/输出；真机 git_clone/push 闭环 + 既有 3 个实证对齐 |
| 真实 git 输出跨 ssh/协议差异 | 仅 http(s) 承诺；ssh 报「不在范围」结构化错误（C2） |
