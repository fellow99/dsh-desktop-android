# 101 · 运行时启动编排（spec.md）

> 状态：🟡 Partial ｜ 依据：docs/000-工程规划.md ｜ 源码落点：runtime/DshRuntime.kt、runtime/Probe.kt
> 目标：从投递 Node 到 loadUrl 的状态机、探活与失败诊断（§6.2）。

## 功能需求

- FR-101-1 状态机 IDLE→INSTALLING→STARTING→WAITING→PROBING→READY→RUNNING/FAILED（§6.2）
- FR-101-2 就绪单一判据：ready.json(url)+HEAD∈{200,303,401}；读后即删（§4.6）
- FR-101-3 失败终态：stage+日志尾+last-crash+重启应用（D19）
- FR-101-4 Activity 重建复用 URL；Exited 显式建模（A5/A6 §4.5）
- FR-101-5 关键参数 Constants 单一事实源（60s/20×500ms/200 行）

## 验收与测试

- 用例索引：overall-test-cases.md TC-L1-*；000-scaffold/test-cases.md TC-000-01/03/06
- 证据纪律：宪法 C3（截图/命令输出/JSON 为唯一判据）。
