# 107 · 诊断与可观测（spec.md）

> 状态：⬜ Planned ｜ 依据：docs/000-工程规划.md ｜ 源码落点：payload/selfcheck.js、@dsh-android/facts（P2）
> 目标：四通道日志、/_android/facts、selfcheck（§6.7）。

## 功能需求

- FR-107-1 四通道：node_bridge.log / app.log / logcat(DSH_ANDROID) / last-crash
- FR-107-2 GET /_android/facts（仅 debug；cookie 鉴权）：版本/插件行/垫片/能力标志/WebView 版本
- FR-107-3 selfcheck.js 断言垫片标记与能力可用性
- FR-107-4 诊断视图脱敏（去 token/路径前缀）

## 验收与测试

- 用例索引：随 P2 定义
- 证据纪律：宪法 C3（截图/命令输出/JSON 为唯一判据）。
