# 103 · WebView 外壳（plan.md）

> 状态：🟡 Partial

## 方案要点

- 矩阵/围栏/自愈/版本门已实现；`getErrorCode` 命名已适配 API36。
- SAF 与路径模型边界：浏览走应用内选择器，SAF 只做导入导出（§6.4 尾注）。

## 依赖

- 上游：deepseek-harness dsh-v0.2.1-rc.2（tag 固定）
- 宪法：C1（零补丁）、C2（诚实降级）、C14（结构化进出）
