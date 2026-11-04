# TEST_REPORT · 112-cli-integration

> 测试环境：真机 小米 M2105K81C（API 30 / arm64-v8a / Asia/Shanghai）· 构建 `assembleFullDebug`
> 载荷 sha：`787884e63a88`（最终）｜ APK 177 MB ｜ 日期：2026-11-05
> 规格用例：`specs/112-cli-integration/test-cases.md`（TC-112-CLI / TC-112-L2）

## 汇总

| TC | 用例 | 结果 | 证据 |
|---|---|---|---|
| TC-112-1 | 产物随包（12 .so + cli-data） | ✅ PASS | `unzip -l` 12 个 `lib*/arm64-v8a/*cli*.so` + assets(cli-data 在 dsh.tar)；APK 177MB |
| TC-112-2 | 装载与物化 + 探针 | ✅ PASS | app.log：`农场就绪（创建 18 条链接）`；probe node=v26.13.0 / git=2.56.0 / python=3.14.10 / pnpm=12.16.1 / uv=0.13.6；cli-data 物化于 payload/<sha>/dsh/cli-data |
| TC-112-3 | Agent 上下文命令（bash 通路） | ✅ PASS | Agent 会话内 bash 工具 7 条命令全 `[exit code: 0]`：node v26.13.0 / git 2.56.0 / pnpm 12.16.1 / python 3.14.10 / uv 0.13.6 / npm 11.20.0 / pip 26.2.2（截图 `evidence/04-git-tools-e2e.png` 同会话） |
| TC-112-4 | PTY 终端命令回程 | ⏳ 未单独驱动 | PTY 面板由 111 已证；CLI spawn 通路与 bash 相同（同 PATH/农场），node-pty 仍就绪（S6 垫片 installed） |
| TC-112-5 | 替换 204-git 21 工具闭环 | ✅ PASS | Agent 会话内 `git_init`（main）→ `write`→ `git_add`（A README.md）→ `git_commit`（dc78f00, yourname）→ `git_log`（含标题）→ `git_status`（clean）；修复过程见下 |
| TC-112-6 | 替换 110-pnpm install/lookup | 🟡 部分 | pnpm 二进制 12.16.1 经 Agent bash 验证；desktopPnpm 框架已接农场（DSH_PNPM_ENGINE=$HOME/bin/pnpm）；install 未跑（需 registry 网络，CN 网络限制） |
| TC-112-L2-1 | Web UI 加载 | ✅ PASS | CDP：`DSH Desktop` @ 127.0.0.1:port 首屏正常 |
| TC-112-L2-2 | 设置 DeepSeek API KEY（**值不落盘仓库**） | ✅ PASS | 模型页「已保存 DeepSeek」；重装后凭据保留；KEY 仅运行时注入，未写入任何规格/日志 |
| TC-112-L2-3 | 创建工作区 | ✅ PASS | browse picker → `…/workspace`，主界面「workspace / 标准模式」 |
| TC-112-L2-4 | 对话「介绍一下你自己」 | ✅ PASS | deepseek-flash（DeepSeek-V4.1-Flash）流式中回复「已完成，用时 3秒」（17.9K tok） |
| TC-112-L2-5 | 看图分析 | ⏳ 未重跑 | 图片管线（read_image）上游未改动；基线 D.4 阶段 2 已全对；本次构建回归点仅限 CLI 层，未覆盖此用例 |
| TC-112-L2-6 | 敏感信息不落盘 | ✅ PASS | 见下扫描 |

## 开发期发现的 Bug 与修复（Agent 交互驱动回归）

1. **cli-env.js 未入载荷**：`assemble-payload` 复制清单漏 `cli-env.js` → «Cannot find module './cli-env.js'»。已加入复制清单 + assertStage 断言。
2. **npm/pip 壳脚本依赖**：`libnpm.so` 需 `NODE_NATIVE_DIR`；`libpip.so` 按 `dirname $0` 找 `libpython_cli.so`。cli-env 注入 `NODE_NATIVE_DIR` + 农场补 `libnode_cli.so`/`libpython_cli.so` 软链 + ENV_ALLOWLIST 追加 `NODE_NATIVE_DIR`。
3. **农场陈旧链接**：重装后 nativeLibraryDir 哈希变化，旧软链悬空不可 exec。改 lstat/readlink 比对重建（「创建 18 条 / 重建 18 条」）。
4. **git_log JSON 无损校验失败**：parseLogRecords 残留 `undefined` 字段 → 工具框架 `value is not lossless JSON`。改为仅写有值字段。
5. **git_log 提交消息丢失**：按空行切块把 `--pretty=raw` 的正文截掉。改按 `commit ` 边界切块，标题正常回显。
6. **payload 二次物化冗余**：CLI 数据源 `src/main/assets/cli` 与载荷内 `cli-data` 重复入包（~33MB）→ 数据源移至 `build/cli-assets`（构建期专用，不进 APK）。
7. **APK 体积**：CLI 五件 .so 增量 → APK 177MB（debug，未压缩引擎 87MB libnode + 231MB CLI 系）。体积治理列为范围外。

## 敏感信息扫描

- 测试 API KEY 仅经设备 UI 设置页注入（运行时），未写入任何 spec/docs/log/evidence 文件。
- 本报告不包含 KEY 明文；屏幕截图仅含对话文字与版本号。
- 最终例行扫描（见回归轮）：`grep` 于 `specs docs logs` 无 `sk-`/`password=`/`Bearer ` 命中。
