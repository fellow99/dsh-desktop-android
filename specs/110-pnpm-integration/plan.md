# 012 · pnpm 集成（运行时装包）（plan.md）

> 状态：⬜ Planned

## 方案要点

- 无需 jitless 层/undici 替身（JIT 可用）；pnpm 版本常量唯一可改点。

## 依赖

- 上游：deepseek-harness dsh-v0.2.1-rc.2（tag 固定）
- 宪法：C1（零补丁）、C2（诚实降级）、C14（结构化进出）
