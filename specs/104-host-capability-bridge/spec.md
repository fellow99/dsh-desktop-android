# 104 · 宿主能力桥（spec.md）

> 状态：🟡 Partial ｜ 依据：docs/000-工程规划.md ｜ 源码落点：host/HostCapabilities.kt
> 目标：16 个冻结能力名、两段式异步、失败语义（§6.4）。

## 功能需求

- FR-104-1 命名 <域>.<动作>；JSON 进出；永不抛；≤64KiB
- FR-104-2 首批：echo/log.write/runtime.facts/perm.allFiles.status/shutdown ✅
- FR-104-3 其余 11 项 + fs.pickFolder/fs.pickFiles/fs.saveFile 两段式协议 —— ⬜ P2
- FR-104-4 pending 结果 5min 过期；host.result 只读内存表；Activity 重建不丢

## 验收与测试

- 用例索引：000-scaffold TC-000-07（echo/invoke 路径）
- 证据纪律：宪法 C3（截图/命令输出/JSON 为唯一判据）。
