# 103 · WebView 外壳（spec.md）

> 状态：🟡 Partial ｜ 依据：docs/000-工程规划.md ｜ 源码落点：ui/WebShellView.kt、MainActivity.kt、res/xml/network_security_config.xml
> 目标：WebView 矩阵、导航围栏、错误页、Activity/渲染进程重建（§6.3）。

## 功能需求

- FR-103-1 §6.3 配置矩阵逐项（JS/DOM/cookie/file 关闭/调试仅 debug）
- FR-103-2 导航围栏：仅本机 origin+about:blank；onCreateWindow 拒绝
- FR-103-3 onRenderProcessGone 自愈；G-WV 版本门禁 ≥110
- FR-103-4 加载/错误覆盖层 + 诊断复制（去 token）+ 重启应用
- FR-103-5 文件选择（SAF）/下载落盘 —— ⬜ P2

## 验收与测试

- 用例索引：TC-L1-2；G11 用例随 P1
- 证据纪律：宪法 C3（截图/命令输出/JSON 为唯一判据）。
