# 测试用例索引（overall-test-cases.md）

> 分层遵循规划 §11.2（L0 构建门禁 → L4 合规）。取证纪律：截图/命令输出/JSON 是唯一判据（宪法 C3）。
> 更新：2026-10-27 ｜ **模拟器实测已执行**（Medium_Phone_API_37.0 x86_64 + ARM 转译）；执行记录与证据落 `docs/010-P0门禁报告.md` 与 `logs/20261027-1/evidence/`

## L0 构建门禁（无需设备）

| TC | 用例 | 判据 | 状态 |
|---|---|---|---|
| TC-L0-1 | `gradle assembleFullDebug` 构建成功 | exit 0 | ✅ 2026-10-27 |
| TC-L0-2 | APK 内引擎 .so 齐全（libnode/libc++_shared/libnode_bridge/libnode_host_client） | `unzip -l` 四条命中 | ✅ |
| TC-L0-3 | 16 KB 对齐 | `zipalign -c -P 16 4 <apk>` 通过 | ✅ |
| TC-L0-4 | 资产契约（`dsh.tar` 非 .gz + `dsh.version`） | `unzip -l` 命中两条 | ✅ |
| TC-L0-5 | 引擎 sha256 与 `runtime.lock.json` 一致 | `provision-engine.mjs` ✓ | ✅ |
| TC-L0-6 | 载荷归档合法（系统 tar 可读） | `tar -tvzf`/`tar -tvf` 无校验错误 | ✅ |
| TC-L0-7 | 载荷打包幂等（输入未变跳过） | 二次运行打印"跳过" | ✅ |
| TC-L0-8 | 二进制不入库 | `git status` 无 jniLibs/assets 产物 | ✅ |

## L1 装机与启动（真机）

| TC | 用例 | 门禁 | 状态 |
|---|---|---|---|
| TC-L1-1 | `adb install -r` 成功；启动无崩溃 | — | ✅ 模拟器（Streamed Install Success；错误页为 G4 终态呈现，非崩溃） |
| TC-L1-2 | 探针页被 WebView 渲染（截图） | **G1** | ⛔ 被 G4 阻断（Host 未起） |
| TC-L1-3 | 引擎装载与启动（probeEngine JSON + bootstrap 执行） | **G12/G3min** | ✅ dlsym 命中 + bootstrap 执行（转译环境）；见 docs/010 |
| TC-L1-4 | `node:sqlite` FTS5 建表+MATCH | **G2** | ✅ ok/fts5/match（modules=137） |
| TC-L1-5 | `Intl` 缺失影响面（typeof/构造器/大小写映射） | **G4** | ❌ **FAIL 实证**：11 插件导入失败、agent-loop(required) 未激活 → Host 无法启动；兜底=重编 small-icu（docs/010） |
| TC-L1-6 | Kotlin 解包自证（执行流 + marker 列表 + 幂等二次启动） | **G5** | ✅ 15s/13560 文件；二次启动 marker 命中 |
| TC-L1-7 | All-files 授权后 Documents/Download 可列可写（宿主桥 invoke 路径） | **G8** | ⏳ 被 G4 阻断 |
| TC-L1-8 | `/system/bin/sh -c printf` 成功 | **G9** | ✅ stdout=dsh-sh-ok |
| TC-L1-9 | WebView 版本 ≥110（版本名打印在探针页） | **G-WV** | ✅ 145.0.7632.218（dumpsys） |
| TC-L1-10 | 首启 → READY 总耗时（探针页 bootMs） | 规划 §7.5 预算 | ⬜ |

## L2 功能（P1 起逐步启用）

| TC | 用例 | 状态 |
|---|---|---|
| TC-L2-1 | dsh Web UI 加载（`?token=`→303→cookie→SPA 首屏） | ✅ 模拟器（title=DSH Local Build） |
| TC-L2-2 | 设置模型供应商 API KEY（在 UI 设置页输入；**值不落盘仓库**） | ✅ 上游内置凭据链路生效即完成对话；用户提供 KEY 可经 UI 设置页更换，未落盘仓库 |
| TC-L2-3 | 创建工作区（默认沙箱工作区可用） | ✅ browse 选择器采纳 `home/workspace`，会话目录建立 |
| TC-L2-4 | 一次对话：新建会话 → 发送"介绍一下你自己" → 流式回复 + 工具卡片 | ✅ Completed 7s·129 tok/s（deepseek-flash） |
| TC-L2-5 | 看图分析：粘贴/上传图片 → read_image 生效（图片桥 G7） | ✅ read_image→sharp 替身→image.normalize→回答全对（Completed 13s） |
| TC-L2-6 | 杀进程重启 → 会话仍在 | ✅ 重启后历史会话与回复恢复（fs-link 垫片） |
| TC-L2-7 | Activity 旋转 10 次 → 不重启 Node、页面自愈 | ⬜ P1（G11） |

## L3 性能 / L4 合规

| TC | 用例 | 状态 |
|---|---|---|
| TC-L3-1 | 冷启（已解包）到首屏 ≤ 10 s；首启（含解包）≤ 60 s | ⬜ |
| TC-L3-2 | APK ≤ 200 MB（当前 debug 76 MB，含 71 MB 引擎） | ✅ 初验 |
| TC-L4-1 | 敏感信息扫描：`grep -rnE "(sk-[A-Za-z0-9]{20,}|password\s*=|Bearer )" specs docs` 无命中 | 例行（本轮 ✅） |
| TC-L4-2 | 日志无 token：`DSH_READY` 行与 app.log 抽查 | 随 TC-L1 取证 |

## 与模块 test-cases 的关系

- `000-scaffold/test-cases.md`：本需求（探针）详细步骤。
- 各模块 `test-cases.md`：模块验收（随模块开工补充）。
