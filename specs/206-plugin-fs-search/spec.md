# 206 · 纯 JS 内容搜索后端（spec.md）

> 状态：⬜ Planned ｜ 依据：docs/000-工程规划.md ｜ 源码落点：packages/fs-search-android/（P3）
> 目标：替换 ripgrep 通道：gitignore-aware 纯 JS 遍历（§5.2 #11）。

## 功能需求

- FR-206-1 工具名与参数与上游一致
- FR-206-2 有界并发/二进制跳过/结果上限
- FR-206-3 G13：5k 文件 <10s 返回前 N 条，否则登记差异或隐藏

## 验收与测试

- 用例索引：G13
- 证据纪律：宪法 C3（截图/命令输出/JSON 为唯一判据）。
