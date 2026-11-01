# 111 · PTY 完整终端能力（spec.md）

> 状态：🟢 In Use（真机 MIX/API26 端到端实证 2026-11-01）｜ 依据：docs/111-PTY实现方案.md ｜ 源码落点：见 plan.md
> 需求编号：**111-pty-integration** ｜ 需求名称：引入 node-pty，实现 pty 能力
> 上游基线：`dsh-v0.2.1-rc.2` ｜ 目标引擎 libnode **v26.13.0**（从 24.22.1 升级）｜ 配套 `node-pty:26.13.0`
> 设计基准：`docs/111-PTY实现方案.md`（决策 D1–D6）

## 一、目标

对上架库 `node-bridge:0.2.0` / `node-runtime:26.13.0` / `node-pty:26.13.0`（Maven Central）直连消费，
在本工程落地**完整 PTY 终端能力**：解禁上游 `terminal-controller` + `ui-sidebar-terminal`，使右侧终端面板
（能力矩阵 #12/#36）真实可用，而非"节点探针存在却不可用"。

## 二、功能需求

- **FR-111-1** 库版本升级（Maven Central 直连）：`node-bridge` 0.2.0（已消费，保持）、`node-runtime`
  26.13.0、`node-pty` 26.13.0（二者版本逐字一致，配对纪律）。引擎由手工 `provision-engine.mjs` 投放
  v24.22.1 改为消费 runtime AAR。
- **FR-111-2** node-pty 原生件可加载：`libpty_node.so` 从 `nativeLibraryDir` 加载成功；`require('node-pty')`
  解析可用；加载失败必须结构化上报（宪法 C2），不静默回退假终端。
- **FR-111-3** `@dsh-android/subprocess.spawnTerminal()` 落地：实现 `SubprocessTerminalHandle` 契约
  （pid/output/done/write/resize/terminate/…），能真实 fork `/system/bin/sh -i`。
- **FR-111-4** 终端面板解禁：`terminal-controller` / `ui-sidebar-terminal` 启用于 HTTP/WS 数据平面；
  面板渲染、输入回环、resize、close/kill 生命周期正确。
- **FR-111-5** 保守保活：`inspectActivity` 不导致活跃终端被自动回收误杀；终端关闭无进程残留。
- **FR-111-6** 引擎升级回归：小写国际/桥装载/会话持久化/通知/git/搜索等既有能力不回归（D.3/D.4 门禁）。

## 三、验收与测试

- 用例索引：`test-cases.md`（TC-111-*），device/emulator 端到端取证。
- 证据纪律：宪法 C3（命令输出/截图/`/_android/facts` 字段为唯一判据）。

## 四、成功准则（可测、技术无关）

1. 应用升级后能正常用 Maven Central 拉取三件套并构建启动（engine 二十六线）。
2. 用户能在右侧终端面板打开一个真实 shell，键入命令、看到回显、面板尺寸变化生效。
3. 关闭终端后设备无残留进程。
4. 既有对话（含看图分析）、工作区、搜索等能力在引擎升级后不回归。
