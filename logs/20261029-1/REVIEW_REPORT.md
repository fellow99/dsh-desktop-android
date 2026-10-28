# REVIEW_REPORT（logs/20261029-1/）

> 阶段：Code Review ｜ 审查对象：af7ad93..3383603 ｜ 审查方式：code-reviewer 子代理（read-only）
> 处置：receiving-code-review 流程（逐项核实 → 修复/登记 → 复编译验证）

## 审查结论（原文摘要）

**无 Critical。** 5 项 Important、7 项 Minor。优点：FGS 合规（FOREGROUND_SERVICE_DATA_SYNC + startForeground 类型提升 + 5s ANR 纪律）、SAF 槽位收口完整、能力注册纪律一致、facts 门禁三层成立、bundle patch 合规。

## 逐项处置

| # | 级别 | 问题 | 核实 | 处置 |
|---|---|---|---|---|
| I1 | Important | keepAliveRefs 泄漏 → dataSync FGS 孤儿；API 35+ 6h 硬限时缺 onTimeout → 崩溃风险 | ✅ 成立 | **已修**：KeepAliveService 补 `onTimeout(startId)` 与 `onTimeout(startId,fgsType)` → stopSelf；notify 插件补 `ctx.on('dispose')` 强制释放 + refs 归零 |
| I2 | Important | fs.saveFile 主线程 base64 解码+落盘；Activity onActivityResult 主线程 IO；stageContent 无上限 | ✅ 成立 | **已修**：saveFile 暂存移后台线程；Activity 解析+IO 全移后台线程（主线程仅 uri 快照）；stageContent 64MB 上限（超限记 failed） |
| I3 | Important | 槽位 5min TTL 与 SAF 用户交互时长矛盾；弃槽滞留 map | ✅ 成立 | **已修**：TTL 按 kind 区分（perm 5min / pickFiles·saveFile 15min）；complete 命中 EXPIRED 打 warn 日志 |
| I4 | Important | clipboard.readImage 无尺寸上限（>6MiB 必超桥 8MiB；OOM 面） | ✅ 成立 | **已修**：先查 OpenableColumns.SIZE，>6MB 拒绝；流式读带 6MB 上限双保险 |
| I5 | Important | facts 能力实现/占位分类失真（slice 切片过时） | ✅ 成立 | **已修**：IMPLEMENTED_CAPABILITIES 改手工维护名单（17 项，对照 Kotlin register 集合），PLACEHOLDER 按 filter 推导 |
| M6 | Minor | saveFile 暂存文件取消/异常路径泄漏 | ✅ 成立 | **已修**：取消与异常路径均 delete；写目标 finally delete |
| M7 | Minor | onCreate 未判 savedInstanceState → 旋转叠出第二选择器 | ✅ 成立 | **已修**：仅 savedInstanceState==null 发起 intent |
| M8 | Minor | notify.show 字段错位：JS 发 body、Kotlin 读 text → 正文恒空（**真实 bug，P1-5"内容不可定制"系误归因**） | ✅ 成立 | **已修**：Kotlin 优先读 body（兼容 text）。附带登记：DSH_ANDROID_FOREGROUND 从未在 DshRuntime env 下发，"前台不打扰"门实际不生效（env 启动期固定，动态化需桥调用，列遗留） |
| M9 | Minor | host.result DONE 分支 get→remove 非原子 | ✅ 成立 | **已修**：PendingSlots.take() 原子取走；pending 分支放回 |
| M10 | Minor | pickFiles 部分失败静默 | ✅ 成立 | **已修**：结果含 `failed` 计数 |
| M11 | Minor | err() 固定 image.normalize hint 误导 | ✅ 成立 | **已修**：hint 改可选参数 |
| M12 | Minor | 文档回写不同步（能力矩阵 #17/#27/#32/#38、facts README 计数） | ✅ 成立 | **已修**：四行矩阵 + README 已同步；#37 亮屏弹出证据已在上轮闭环（通知栏截图） |

**P1-4 验收标注**：采纳"部分达成（依赖上游）"——desktopPnpm.lookup 契约成员已交付；"安装对话框 lookup 不再 ENOENT"需上游 plugin-manager feature-detect 该成员后才成立（已在 DEV_CHECKLIST / 能力清单 D.2 登记，含"PATH 垫片不可行"的论证）。

## 验证

- `node --check`：market/notify/facts 三包通过
- `gradlew :app:compileFullReleaseKotlin :app:processFullReleaseManifest`：BUILD SUCCESSFUL
- 设备行为验证：待签名恢复（阻塞登记不变）
