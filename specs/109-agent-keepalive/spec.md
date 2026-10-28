# 109 · Agent 保活（前台服务）（spec.md）

> 状态：⬜ Planned ｜ 依据：docs/000-工程规划.md ｜ 源码落点：runtime/AgentKeepAlive.kt（P2）
> 目标：仅 agent turn 运行期前台服务保活，结束即停（§6.6）。

## 功能需求

- FR-109-1 dataSync 类型 + 低优先级常驻通知；不做无条件常驻
- FR-109-2 监听 turn/start…turn/end 决定起停
- FR-109-3 POST_NOTIFICATIONS（33+）按需请求，拒绝则应用内提示

## 验收与测试

- 用例索引：随 P2 定义
- 证据纪律：宪法 C3（截图/命令输出/JSON 为唯一判据）。
