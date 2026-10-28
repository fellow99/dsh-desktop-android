# 106 · 工作区选择（三+一主目录）（plan.md）

> 状态：⬜ Planned

## 方案要点

- 后端原语复用上游 -browse；不自实现 FS。
- 依赖 G8 结论（All-files 可用性）。

## 依赖

- 上游：deepseek-harness dsh-v0.2.1-rc.2（tag 固定）
- 宪法：C1（零补丁）、C2（诚实降级）、C14（结构化进出）
