# 102 · 载荷管线（spec.md）

> 状态：🟡 Partial ｜ 依据：docs/000-工程规划.md ｜ 源码落点：runtime/PayloadInstaller.kt、scripts/package-payload.mjs、scripts/provision-engine.mjs
> 目标：构建/装配/裁剪/打包/解包/垫片（§7）。

## 功能需求

- FR-102-1 确定性裸 ustar 契约（mtime0/排序/无 pax）+ dsh.version sha 对账
- FR-102-2 Kotlin 解包：marker 幂等、tmp+rename、zip-slip 防护、代际 previous
- FR-102-3 引擎投放：provision 八项门禁 + sha256 对账 lock（偏差：jniLibs 而非 Maven）
- FR-102-4 上游装配 build-upstream/assemble-payload/crop-rules/verify-upstream（§7.1/7.2）——⬜ P1
- FR-102-5 垫片 4 条：flock/sharp/require-builtin/sqlite 条件（§5.3）——⬜ P1

## 验收与测试

- 用例索引：TC-L0-4..7；000-scaffold TC-000-06
- 证据纪律：宪法 C3（截图/命令输出/JSON 为唯一判据）。
