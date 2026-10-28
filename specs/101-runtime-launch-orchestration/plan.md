# 101 · 运行时启动编排（plan.md）

> 状态：🟡 Partial

## 方案要点

- 已实现：DshRuntime 单例 + ensureStarted 单飞 + awaitReadyEnvelope 退化路径。
- 真机待验：冷启时长、marker 幂等二启、旋转重建（G11 属 L2）。

## 依赖

- 上游：deepseek-harness dsh-v0.2.1-rc.2（tag 固定）
- 宪法：C1（零补丁）、C2（诚实降级）、C14（结构化进出）
