# DEV_CHECKLIST · 112-cli-integration

> 开发阶段检查清单（logs/20261104-1）。规格 `specs/112-cli-integration/`。

- [x] 规格四件套已建并提交（docs(112) 5596712）
- [x] T002 .gitignore 排除 CLI 二进制与数据资产（build/cli-assets、jniLibs、assets/cli）
- [x] T003 scripts/cli.lock.json（事实源；五件 sha256 与 Release 官方一致）
- [x] T004 scripts/provision-cli.mjs（下载→校验→归一化解包→check）
- [x] T005 执行投放五件套（12×.so → jniLibs；cli 数据 → build/cli-assets）
- [x] T006 assemble-payload 纳入 CLI 数据资产（→ dsh/cli-data）+ cli-env.js 复制 + 断言
- [x] T007 Kotlin env DSH_CLI_DATA_DIR + Constants.CLI_DATA_SUBDIR
- [x] T008 Gradle assembleFullDebug 通过（12 .so + cli-data 入包；assets/cli 不二次入包）
- [x] T009-T010 真机装载/物化/版本探针（农场 18 链接；probe 五件真实版本写 ready.cli）
- [x] T011-T012 环境引导层 + $HOME/bin 农场（lstat/readlink 重建防陈旧链接）
- [x] T013 subprocess 护栏放行 nativeLibraryDir + ENV_ALLOWLIST 增补
- [x] T014-T015 真机命令回程（bash 工具 7 命令 exit 0；PTY 通路未单独驱动，见 TEST_REPORT）
- [x] T016-T021 204 git 替换（git-exec + 21 工具 + 凭据 store 文件 + Agent 实证 init/add/commit/log/status）
- [x] T022-T025 110 pnpm 替换（DSH_PNPM_ENGINE→农场；desktopPnpm spawn；版本实证）
- [x] T026 规格/README 回填（112 delivered + 204/110 替换声明 + 能力清单 T-023）
- [x] T027 敏感信息扫描（文本文件干净；仅 gitignore 二进制假命中）
- [x] T028 codegraph sync + 双仓提交（子模块 + 父工程指针）

## 开发中经真机驱动发现并修复
1. cli-env.js 缺入载荷（复制清单）
2. npm 需 NODE_NATIVE_DIR；pip 需农场 libpython_cli.so 软链
3. 重装后农场陈旧链接悬空（lstat/readlink 重建）
4. git_log 非无损 JSON（undefined 字段）
5. git_log 提交消息被空行切块截断
6. CLI 数据二次物化冗余（改 build/cli-assets）
