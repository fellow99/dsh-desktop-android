# 106 · 工作区选择（三+一主目录）（spec.md）

> 状态：⬜ Planned ｜ 依据：docs/000-工程规划.md ｜ 源码落点：packages/workspace-picker-android/（P2/P3）
> 目标：三主目录（沙箱/文档/下载）+ 桌面（存在才显示）+ 根围栏 + 权限门（§5.2 规格）。

## 功能需求

- FR-106-1 主目录来源 = Kotlin env 下发（DSH_USER_ROOT + DSH_EXTRA_WRITABLE_ROOTS），单一事实源
- FR-106-2 dual-face：host 面宿主能力 + client 面 directoryFlow 双槽独占
- FR-106-3 根围栏：首列锁主目录；无手动路径输入；切主目录整栈重置；四域互不可上溯
- FR-106-4 授权门：无 All-files 时「去授权/刷新」，点 Tab 只查不弹窗
- FR-106-5 记忆只记主目录 id（localStorage）；采纳复用 createWorkspace

## 验收与测试

- 用例索引：随 P2 定义
- 证据纪律：宪法 C3（截图/命令输出/JSON 为唯一判据）。
