# DEV_CHECKLIST · 112-cli-integration

> 开发阶段检查清单（logs/20261104-1）。规格 `specs/112-cli-integration/`。

## 检查项
- [x] 规格四件套已建并提交
- [ ] T002 .gitignore 排除 CLI 二进制与数据资产
- [ ] T003 scripts/cli.lock.json（事实源）
- [ ] T004 scripts/provision-cli.mjs（下载→校验→投放→check）
- [ ] T005 执行投放五件套（jniLibs 12×.so + assets/cli）
- [ ] T006 assemble-payload.mjs 纳入 CLI 数据资产
- [ ] T007 Kotlin env DSH_CLI_DATA_DIR + Constants
- [ ] T008 Gradle assembleFullDebug 含 12 .so + assets
- [ ] T009-T010 真机装载/物化/版本探针（facts）
- [ ] T011-T012 环境引导层 + $HOME/bin 农场
- [ ] T013 subprocess 护栏放行 nativeLibraryDir
- [ ] T014-T015 真机 bash/PTY 命令回程
- [ ] T016-T021 204 git 替换（git-exec + 21 工具 + 凭据 + clone/push）
- [ ] T022-T025 110 pnpm 替换（DSH_PNPM_ENGINE + desktopPnpm + install/lookup）
- [ ] T026 规格/README 回填（含 204/110 集成声明）
- [ ] T027 敏感信息扫描
- [ ] T028 codegraph sync + 提交
