# 代码评审报告与处置（REVIEW_REPORT.md）

- 评审时间：2026-10-27
- 评审范围：`2f886c6..cde6269`（dsh-desktop-android，000-scaffold 全部代码）
- 评审方式：requesting-code-review 技能派发只读评审子代理（外部视角）；receiving-code-review 技能逐条核实处置
- 结论（评审方）：需修复后继续

## Critical

| # | 发现 | 核实 | 处置 |
|---|---|---|---|
| C1 | attachment-image 默认 `timeoutMs=30_000` 被 host-bridge 前置拒绝，`toBuffer()` 必失败 | 属实（桥硬上限 10s） | ✅ `DEFAULT_BRIDGE_TIMEOUT_MS` 改 10_000，30s 预算登记为 P2 两段式 |
| C2 | `image.normalize` base64 进出违反桥 8KiB/64KiB 上限，未登记 | **部分驳回**：桥 0.2.0 实际 `NodeRuntimeOptions.capBytes` 默认 8 MiB（NodeState.kt），非规划文本的 64KiB；但输入上限确实缺失 | ✅ Kotlin 侧加 base64 ≤8MB 输入上限 + 注释登记实现事实；真机门禁复核 |
| C3 | 我们的 `payload/host.js` 与桥内置客户端 `host.js` 同名互斥（物化不覆盖已存在文件 → 二者只能活一个） | 属实（致命：图片链路 100% 不可用） | ✅ 宿主启动器改名 `payload/host-boot.js`（bootstrap/assemble/entry 三处同步），桥客户端 host.js 得以物化 |
| C4 | `ready.json` 仅在成功路径删除；失败/被杀时一次性 token 明文留盘 | 属实（违反 §8.4/C9） | ✅ `awaitReadyEnvelope` 读到 ready/failed 均立即删除；超时路径亦删除 |

## Important（本轮修复）

| # | 发现 | 处置 |
|---|---|---|
| I5 | WebView 后加覆盖加载层/错误层 → 覆盖层永远被盖住 | ✅ `addView(wv, 0, …)` 置底 |
| I6 | WebView 版本门禁 fail-open（AOSP/Trichrome 查不到包即放行） | ✅ 优先 `WebView.getCurrentWebViewPackage()`（框架 API，minSdk 29 可用），PM 兜底 |
| I7 | STOPPED 后 `ensureStarted` 短路 → 界面死等 | ✅ STOPPED 态渲染错误页 +「重启应用」 |
| I8 | ready.json 失败态（failed/payload-missing）被忽略，干等 55s | ✅ 读到失败态立即终态失败并带 diagnostic |
| I9 | 退化路径拿无 token 的 origin 当 URL | ✅ 如实判失败（C2），提示重启应用 |
| I10 | READY+RUNNING 双触发导致页面加载两次 | ✅ 仅 RUNNING 触发 |
| I11 | S3 垫片依赖 `--expose-internals` 但无人注入 | ✅ `execArgv=["--expose-internals"]`；bootstrap 打印 execArgv 自证 |
| I13 | app.log 无界增长 | ✅ >2MB 轮转 app.log.1 |
| I15 | runtime.facts 缺 `ok` 字段 | ✅ 统一包 `{"ok":true,…}` |
| I30 | TECH.md 状态行过期 | ✅ 更新（装配脚本 ✅、@dsh-android/* 🟡） |

## Important（部分/驳回，登记理由）

| # | 发现 | 处置 |
|---|---|---|
| I12 | 能力在主线程执行 | **部分采纳**：image.normalize 加输入上限（C2）；log.write 为毫秒级 append 保留内联；probe.allFiles 为探针期临时能力（随探针清理移除）；两段式异步属 P2（specs/104 已登记） |
| I14 | 剪裁规则含 `android` 会误删 android-arm64 预编译包 | **暂不采纳**：规划 §8.3 明确"不引入其它原生 addon"，当前树无 android-arm64 原生依赖（sharp 已被 S2 顶替）；若未来引入原生 addon 需先过 §8.3 门禁 |
| I17 | shutdown 能力返回 ok:true 但无操作 | **驳回**：桥设计即"注册 shutdown 钩子，真正停止=进程退出"（bridge README/样例同语义），非伪造成功 |
| I21 | flock 垫片 ESM/CJS 不匹配 | **驳回**：实测上游 `node-addon-system` 为 `"type":"module"`，ESM 垫片正确 |

## Minor（本轮顺带修复）

- I16 echo 改经 guard 解析重建（避免拼接非法 JSON）✅
- I18 `rotate:true` 顺时针 90° 生效 ✅
- I19 width/height ≤0 视为未指定 ✅
- I22 打包格式版本并入幂等键（PACK_FORMAT）✅
- I24 `..` 按路径段判定（`foo..bar` 不再误判）✅
- I28 错误页/剪贴板日志脱敏（token/sk-/Bearer）✅
- 文档：ARCHITECTURE/000-scaffold/TECH 的 host.js→host-boot.js 与状态行同步 ✅

## Minor（遗留，登记后续）

- I20 flock 标记校验、I23 目录头去重、I25 assertInsertedRowsResolve 空检查、I26 previous 回滚入口、I27 诊断字段丰富、I29 provision 默认路径 —— 记入 specs 各模块后续迭代
- 测试缺口（评审指出）：TarReader 对抗性用例、打包↔解包往返单测、Robolectric 状态机用例 —— 登记入 `specs/000-scaffold/tasks.md` G 组后续

## 修复后验证

- `assemble-payload --deploy --apply`：13560 文件 / 142.2 MiB，全部断言 ✓
- `package-payload --src …`：dsh.tar 199,881,216 B / sha256=fc794baceb98…
- `gradle assembleFullDebug`：BUILD SUCCESSFUL，APK 124,176,470 B
- `zipalign -c -P 16 4`：通过
