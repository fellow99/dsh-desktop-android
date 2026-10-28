# 104 · 宿主能力桥（plan.md）

> 状态：🟡 Partial

## 方案要点

- guard 包装统一失败语义；SAF 只给 tree URI ⇒ 仅 primary volume 可解析为绝对路径，否则显式失败。
- registerAsync（P2 反哺桥）落地前不改调用方协议。

## 依赖

- 上游：deepseek-harness dsh-v0.2.1-rc.2（tag 固定）
- 宪法：C1（零补丁）、C2（诚实降级）、C14（结构化进出）
