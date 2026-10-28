# 105 · 上游适配层（android profile + bundle）（plan.md）

> 状态：⬜ Planned

## 方案要点

- 复制 ark bundle-ohos 改名（附录 C）；sandbox-policy 可写根显式覆盖。
- P1 与正式载荷装配同步落地。

## 依赖

- 上游：deepseek-harness dsh-v0.2.1-rc.2（tag 固定）
- 宪法：C1（零补丁）、C2（诚实降级）、C14（结构化进出）
